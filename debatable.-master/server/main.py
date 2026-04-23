import os
from fastapi import FastAPI, File, Form, UploadFile, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse, JSONResponse
from groq import Groq
from dotenv import load_dotenv
import requests
from typing import Optional
from pydantic import BaseModel
import json
import logging
import tempfile

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

load_dotenv()
api_key = os.getenv("GROQ_API_KEY")
if api_key:
    groq = Groq(api_key=api_key)
else:
    groq = None
    logger.warning("GROQ_API_KEY not found. Running in mock mode.")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class DebateSettings(BaseModel):
    topic: str
    max_tokens: int = 1500

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