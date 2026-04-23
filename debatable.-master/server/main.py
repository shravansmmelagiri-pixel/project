import os
from fastapi import FastAPI, File, Form, UploadFile, HTTPException, Depends, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from groq import Groq
from dotenv import load_dotenv
import requests
from typing import Optional
from pydantic import BaseModel
import json
import logging
import tempfile
from sqlalchemy.orm import Session
from database import get_db, User, SearchHistory
from auth import get_password_hash, verify_password, create_access_token, verify_token

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
api_key = os.getenv("GROQ_API_KEY")
if api_key and api_key != "YOUR_GROQ_API_KEY_HERE" and not api_key.startswith("AIzaSy"):
    try:
        groq = Groq(api_key=api_key)
        # Test the API key with a simple call
        test_response = groq.chat.completions.create(
            model="openai/gpt-oss-20b",
            messages=[{"role": "user", "content": "test"}],
            max_tokens=1
        )
        logger.info("GROQ_API_KEY validated successfully")
    except Exception as e:
        logger.warning(f"GROQ_API_KEY is invalid: {e}. Running in mock mode.")
        groq = None
else:
    groq = None
    logger.warning("GROQ_API_KEY not set or using placeholder. Running in mock mode.")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

# Pydantic models
class UserCreate(BaseModel):
    email: str
    username: str
    password: str

class UserLogin(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class DebateSettings(BaseModel):
    topic: str
    max_tokens: int = 1500

# Authentication functions
def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    try:
        token = credentials.credentials
        username = verify_token(token)
        if username is None:
            return None
        user = db.query(User).filter(User.username == username).first()
        return user
    except:
        return None

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)):
    token = credentials.credentials
    username = verify_token(token)
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

# Authentication endpoints
@app.post("/auth/register", response_model=Token)
async def register(user: UserCreate, db: Session = Depends(get_db)):
    # Check if user already exists
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    db_user = db.query(User).filter(User.username == user.username).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    # Create new user
    hashed_password = get_password_hash(user.password)
    db_user = User(email=user.email, username=user.username, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    
    # Create access token
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/login", response_model=Token)
async def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.username == user.username).first()
    if not db_user:
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    if not verify_password(user.password, db_user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": user.username})
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/auth/me")
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return {
        "id": current_user.id,
        "username": current_user.username,
        "email": current_user.email,
        "created_at": current_user.created_at
    }

@app.get("/history")
async def get_search_history(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    history = db.query(SearchHistory).filter(SearchHistory.user_id == current_user.id).order_by(SearchHistory.created_at.desc()).all()
    return [
        {
            "id": item.id,
            "topic": item.topic,
            "transcription": item.transcription,
            "rebuttal": item.rebuttal,
            "analysis": item.analysis,
            "created_at": item.created_at
        }
        for item in history
    ]

# generates the rebuttal
def get_debate_prompt(transcription: str, settings: DebateSettings) -> str:
    
    return f"""
    
    Topic: {settings.topic}
    User's Argument: "{transcription}"
    
    Structure your response in the following format:
    1. Opening Statement (1 sentence)
    2. Main Counterarguments (2 sentences)
    4. Closing Statement (1 sentence)
    
    Give your speech like you are presenting in front of someone (no titles, subheadings, etc.)
    """

#analyze the response by the user and the AI 
def get_analysis_prompt(transcription: str, rebuttal: str, topic: str) -> str:
    return f"""
    Analyze the following debate exchange and provide detailed feedback:

    Topic: {topic}
    User's Argument: "{transcription}"
    AI's Rebuttal: "{rebuttal}"

    Provide analysis in the following structure:

    Argument Strength Analysis
    - User's argument strengths
    - User's argument weaknesses
    - AI's rebuttal effectiveness

    Improvement Suggestions
    - Areas for improvement
    - Specific recommendations
    - Alternative approaches
    
    Keep the analysis constructive and focused on debate skills development.
    Use bullet points instead of asterisks (*).
    Do not use markdown formatting or special characters.
    DO NOT CUT OFF ANYTHING IN THE RESPONSE.
    """

#api endpoint
@app.post("/debate/full")
async def debate_full(
    audio: UploadFile = File(...),
    topic: str = Form(...),
    current_user: User = Depends(get_current_user_optional),  # Optional authentication
    db: Session = Depends(get_db)
):
    try:
        logger.info("Starting debate processing")
        
        if not topic.strip():
            raise HTTPException(status_code=400, detail="Topic cannot be empty")

        logger.info("Processing stt")
        audio_data = await audio.read()
        logger.info(f"Audio data size: {len(audio_data)} bytes, filename: {audio.filename}")
        
        # Determine file extension from filename
        file_extension = '.webm'
        if audio.filename:
            if audio.filename.endswith('.mp4'):
                file_extension = '.mp4'
            elif audio.filename.endswith('.wav'):
                file_extension = '.wav'
        
        with tempfile.NamedTemporaryFile(suffix=file_extension, delete=False) as temp_audio:
            temp_audio.write(audio_data)
            temp_audio_path = temp_audio.name

        try:
            if groq is None:
                # Mock transcription when no API key is available
                transcription = "This is a mock transcription. Please set a valid GROQ_API_KEY to enable real speech-to-text conversion. Your spoken argument would be transcribed here."
                logger.info("Using mock transcription due to missing API key")
            else:
                try:
                    with open(temp_audio_path, 'rb') as audio_file:
                        logger.info(f"Sending STT request with file: {temp_audio_path}")
                        stt_response = requests.post(
                            "https://api.groq.com/openai/v1/audio/transcriptions",
                            headers={"Authorization": f"Bearer {api_key}"},
                            files={"file": (audio.filename or f"recording{file_extension}", audio_file, f"audio/{file_extension[1:]}")},
                            data={"model": "whisper-large-v3"}
                        )
                        logger.info(f"STT response status: {stt_response.status_code}")
                    
                    if not stt_response.ok:
                        logger.error(f"Speech-to-text failed: {stt_response.text}")
                        raise HTTPException(
                            status_code=400,
                            detail=f"Speech-to-text conversion failed: {stt_response.text}"
                        )
                        
                    transcription = stt_response.json()["text"].strip()
                    logger.info(f"Transcription: {transcription}")
                except Exception as e:
                    logger.error(f"STT error: {str(e)}")
                    raise HTTPException(
                        status_code=400,
                        detail=f"Speech-to-text conversion failed: {str(e)}"
                    )
        finally:
            os.unlink(temp_audio_path)
   
        logger.info("Generating rebuttal")
        settings = DebateSettings(
            topic=topic
        )
        
        if groq is None:
            rebuttal = "This is a mock rebuttal. Please set your GROQ_API_KEY to get real AI responses. Your argument about '{transcription[:50]}...' is interesting, but I would counter that there are several perspectives to consider on the topic of {topic}."
        else:
            prompt = get_debate_prompt(transcription, settings)
            response = groq.chat.completions.create(
                model="openai/gpt-oss-20b",
                messages=[
                    {"role": "system", "content": "You are an intelligent debate opponent."},
                    {"role": "user", "content": prompt},
                ],
                temperature=0.7,
                max_tokens=settings.max_tokens,
            )
            rebuttal = response.choices[0].message.content.strip()
        logger.info(f"Rebuttal generated successfully. Length: {len(rebuttal)} characters")
        logger.info(f"Rebuttal preview: {rebuttal[:100]}...")
        
        logger.info("Generating analysis")
        if groq is None:
            analysis = "Mock analysis: Your argument shows good structure but could benefit from more specific examples. The rebuttal provides a balanced counterpoint. Overall, you're developing strong debate skills!"
        else:
            analysis_prompt = get_analysis_prompt(transcription, rebuttal, topic)
            analysis_response = groq.chat.completions.create(
                model="openai/gpt-oss-20b",
                messages=[
                    {"role": "system", "content": "You are a debate analysis expert."},
                    {"role": "user", "content": analysis_prompt},
                ],
                temperature=0.7,
                max_tokens=500,
            )
            analysis = analysis_response.choices[0].message.content.strip()
        logger.info("Analysis generated successfully")
        
        # Save to search history if user is authenticated
        if current_user:
            search_history = SearchHistory(
                user_id=current_user.id,
                topic=topic,
                transcription=transcription,
                rebuttal=rebuttal,
                analysis=analysis
            )
            db.add(search_history)
            db.commit()
            logger.info(f"Saved search history for user {current_user.username}")
        
        logger.info("Processing complete")
        return JSONResponse(
            content={
                "transcription": transcription,
                "rebuttal": rebuttal,
                "analysis": analysis
            }
        )
        
    except Exception as e:
        logger.error(f"Error in debate processing: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/")
async def root():
    return {"message": "AI Debate Partner API is running"}