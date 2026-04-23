import React, { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import './App.css';


function App() {
  const [topic, setTopic] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [transcription, setTranscription] = useState('');
  const [rebuttal, setRebuttal] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [liveTranscription, setLiveTranscription] = useState('');
  const [volume, setVolume] = useState(1);
  const [isPaused, setIsPaused] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [authMode, setAuthMode] = useState<'register' | 'login'>('register');
  const [showHistory, setShowHistory] = useState(false);
  const [searchHistory, setSearchHistory] = useState([]);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ email: '', username: '', password: '' });
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const synth = window.speechSynthesis;

  // Check if user is logged in on app load
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      // Verify token and get user info
      axios.get('http://localhost:8000/auth/me', {
        headers: { Authorization: `Bearer ${token}` }
      })
      .then(response => {
        setCurrentUser(response.data);
        setIsLoggedIn(true);
      })
      .catch(() => {
        localStorage.removeItem('token');
      });
    }
  }, []);

  // initialize speech recognition
  useEffect(() => {
    if ('webkitSpeechRecognition' in window) {
      const recognition = new (window as any).webkitSpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      
      recognition.onresult = (event: any) => {
        const transcript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result) => result.transcript)
          .join('');
        setLiveTranscription(transcript);
      };

      recognition.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  // Authentication functions
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:8000/auth/login', loginForm);
      const { access_token } = response.data;
      localStorage.setItem('token', access_token);
      
      // Get user info
      const userResponse = await axios.get('http://localhost:8000/auth/me', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      
      setCurrentUser(userResponse.data);
      setIsLoggedIn(true);
      setLoginForm({ username: '', password: '' });
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Login failed');
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const response = await axios.post('http://localhost:8000/auth/register', registerForm);
      const { access_token } = response.data;
      localStorage.setItem('token', access_token);
      
      // Get user info
      const userResponse = await axios.get('http://localhost:8000/auth/me', {
        headers: { Authorization: `Bearer ${access_token}` }
      });
      
      setCurrentUser(userResponse.data);
      setIsLoggedIn(true);
      setRegisterForm({ email: '', username: '', password: '' });
    } catch (error: any) {
      alert(error.response?.data?.detail || 'Registration failed');
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    setIsLoggedIn(false);
    setCurrentUser(null);
    setSearchHistory([]);
  };

  const loadSearchHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get('http://localhost:8000/history', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSearchHistory(response.data);
      setShowHistory(true);
    } catch (error) {
      alert('Failed to load search history');
    }
  };

  //speak to text with Web Speech API
  const speakText = (text: string) => {
    if (synth.speaking) {
      synth.cancel();
    }
    setIsPaused(false);
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.volume = volume;
    utterance.voice = synth.getVoices().find(voice => voice.name === 'Samantha') || null;
    
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => {
      setIsSpeaking(false);
      setIsPaused(false);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setIsPaused(false);
    };
    
    synth.speak(utterance);
  };

  const pauseSpeech = () => {
    if (synth.speaking && !synth.paused) {
      synth.pause();
      setIsPaused(true);
    }
  };

  const resumeSpeech = () => {
    if (synth.paused) {
      synth.resume();
      setIsPaused(false);
    }
  };

  const stopSpeech = () => {
    if (synth.speaking || synth.paused) {
      synth.cancel();
      setIsSpeaking(false);
      setIsPaused(false);
    }
  };

  const parseAnalysis = (text: string) => {
    const lines = text.split('\n');
    const elements: React.ReactElement[] = [];
    let currentSubsection: string | null = null;
    let currentItems: string[] = [];
    let sectionKey = 0;

    const flushItems = () => {
      if (currentItems.length > 0) {
        const subsectionLower = currentSubsection?.toLowerCase() || '';
        const isStrength = subsectionLower.includes('strength') && !subsectionLower.includes('weakness');
        const isWeakness = subsectionLower.includes('weakness');
        const isImprovement = subsectionLower.includes('improvement') || 
                            subsectionLower.includes('suggestion') ||
                            subsectionLower.includes('recommendation');
        
        elements.push(
          <div key={`items-${sectionKey++}`} className={`analysis-items ${isStrength ? 'strength' : ''} ${isWeakness ? 'weakness' : ''} ${isImprovement ? 'improvement' : ''}`}>
            {currentItems.map((item, idx) => (
              <div key={idx} className="analysis-item">
                <span className="item-bullet">{isStrength ? '✓' : isWeakness ? '✗' : isImprovement ? '→' : '•'}</span>
                <span className="item-text">{item}</span>
              </div>
            ))}
          </div>
        );
        currentItems = [];
      }
    };

    lines.forEach((line) => {
      let trimmed = line.trim();
      
      trimmed = trimmed.replace(/\*\*/g, '').replace(/\*/g, '');

      if (!trimmed) {
        if (currentItems.length > 0) {
          flushItems();
        }
        return;
      }

      const mainSectionMatch = trimmed.match(/^(\d+\.\s*)?(Argument Strength Analysis|AI'?s rebuttal effectiveness|Improvement Suggestions|Areas for improvement|Specific recommendations)/i);
      if (mainSectionMatch) {
        flushItems();
        currentSubsection = null;
        const sectionTitle = trimmed.replace(/^\d+\.\s*/, '').trim();
        elements.push(
          <div key={`section-${sectionKey++}`} className="analysis-main-section">
            <h3 className="analysis-section-title">{sectionTitle}</h3>
          </div>
        );
        return;
      }

      let isBullet = false;
      let textWithoutBullet = trimmed;
      if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*') || /^[•\-*]\s/.test(trimmed)) {
        isBullet = true;
        textWithoutBullet = trimmed.replace(/^[•\-*]\s*/, '').trim();
      }

      const hasColon = textWithoutBullet.endsWith(':');
      const isShortLine = textWithoutBullet.length < 120;
      
      const explicitSubsectionPatterns = [
        /^areas? for improvement$/i,
        /^specific recommendations?$/i,
        /^user'?s argument (strengths?|weaknesses?)$/i,
        /^ai'?s rebuttal effectiveness$/i,
        /^improvement suggestions?$/i,
        /^alternative approaches?$/i
      ];
      
      const generalSubsectionPatterns = [
        /user'?s argument (strengths?|weaknesses?)/i,
        /ai'?s rebuttal effectiveness/i,
        /improvement suggestions?/i,
        /areas? for improvement/i,
        /specific recommendations?/i,
        /alternative approaches?/i,
        /(strengths?|weaknesses?|effectiveness|suggestions?|recommendations?|areas?|points?|issues?|approaches?):?$/i
      ];
      
      const isExplicitSubsection = explicitSubsectionPatterns.some(pattern => pattern.test(textWithoutBullet));
      const isGeneralSubsection = generalSubsectionPatterns.some(pattern => pattern.test(textWithoutBullet)) ||
                                 (hasColon && isShortLine) ||
                                 (textWithoutBullet.toLowerCase().includes("'s") && hasColon && isShortLine);

      if (isExplicitSubsection || (isGeneralSubsection && isShortLine)) {
        flushItems();
        currentSubsection = textWithoutBullet.replace(/:$/, '').trim();
        elements.push(
          <h4 key={`subsection-${sectionKey++}`} className="analysis-subsection">
            {textWithoutBullet}
          </h4>
        );
        return;
      }

      if (isBullet) {
        if (textWithoutBullet) {
          currentItems.push(textWithoutBullet);
        }
        return;
      }

      const explicitSubsectionCheck = [
        /^areas? for improvement$/i,
        /^specific recommendations?$/i,
        /^user'?s argument (strengths?|weaknesses?)$/i,
        /^ai'?s rebuttal effectiveness$/i,
        /^improvement suggestions?$/i,
        /^alternative approaches?$/i
      ].some(pattern => pattern.test(trimmed));
      
      const couldBeSubsection = explicitSubsectionCheck ||
                               (trimmed.length < 80 && 
                               trimmed.length > 3 &&
                               trimmed[0] === trimmed[0].toUpperCase() &&
                               !trimmed.includes('.') &&
                               !trimmed.includes(';') &&
                               !trimmed.match(/^[a-z]/) &&
                               (trimmed.split(' ').length <= 8) &&
                               (trimmed.toLowerCase().includes('strength') ||
                                trimmed.toLowerCase().includes('weakness') ||
                                trimmed.toLowerCase().includes('effectiveness') ||
                                trimmed.toLowerCase().includes('suggestion') ||
                                trimmed.toLowerCase().includes('recommendation') ||
                                trimmed.toLowerCase().includes('improvement') ||
                                trimmed.toLowerCase().includes('area') ||
                                trimmed.toLowerCase().includes('approach')));
      
      if (couldBeSubsection && currentItems.length > 0) {
        flushItems();
        currentSubsection = trimmed;
        elements.push(
          <h4 key={`subsection-${sectionKey++}`} className="analysis-subsection">
            {trimmed}
          </h4>
        );
      } else if (couldBeSubsection) {
        currentSubsection = trimmed;
        elements.push(
          <h4 key={`subsection-${sectionKey++}`} className="analysis-subsection">
            {trimmed}
          </h4>
        );
      } else {
        currentItems.push(trimmed);
      }
    });

    flushItems();
    return elements;
  };

  //stop recording 
  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsRecording(false);
    }
    if (synth.speaking) {
      synth.cancel();
      setIsSpeaking(false);
    }
  };

  //start recording 
  const handleStartRecording = async () => {
    if (!topic) {
      alert("Please enter a debate topic.");
      return;
    }

    setIsRecording(true);
    setIsLoading(false);
    setTranscription('');
    setRebuttal('');
    setAnalysis('');
    setLiveTranscription('');

    try {
      // start speech recognition
      if (recognitionRef.current) {
        recognitionRef.current.start();
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Try to use a more compatible audio format
      let mimeType = 'audio/webm;codecs=opus';
      if (MediaRecorder.isTypeSupported('audio/mp4')) {
        mimeType = 'audio/mp4';
      } else if (MediaRecorder.isTypeSupported('audio/wav')) {
        mimeType = 'audio/wav';
      } else if (MediaRecorder.isTypeSupported('audio/webm')) {
        mimeType = 'audio/webm';
      }
      
      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: mimeType
      });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        audioChunksRef.current.push(event.data);
      };

      mediaRecorder.onstop = async () => {
        setIsLoading(true);
        const audioBlob = new Blob(audioChunksRef.current, { 
          type: mimeType
        });
        const formData = new FormData();
        const fileExtension = mimeType.includes('mp4') ? 'mp4' : 
                             mimeType.includes('wav') ? 'wav' : 'webm';
        formData.append('audio', audioBlob, `recording.${fileExtension}`);
        formData.append('topic', topic);


        try {
          console.log('Sending audio to server...', { mimeType, fileExtension });
          
          const config = isLoggedIn ? {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          } : {};
          
          const response = await axios.post('http://localhost:8000/debate/full', formData, config);
          
          setTranscription(response.data.transcription);
          setRebuttal(response.data.rebuttal);
          setAnalysis(response.data.analysis);

          // Speak the rebuttal
          speakText(response.data.rebuttal);
        } catch (error: any) {
          console.error('Error:', error);
          if (error.response) {
            console.error('Response data:', error.response.data);
            console.error('Response status:', error.response.status);
            alert(`Error: ${error.response.data?.detail || 'An error occurred while processing your debate. Please try again.'}`);
          } else {
            alert('An error occurred while processing your debate. Please try again.');
          }
        } finally {
          setIsLoading(false);
          setIsRecording(false);
          stream.getTracks().forEach(track => track.stop());
        }
      };

      mediaRecorder.start();
    } catch (error) {
      console.error('Error accessing microphone:', error);
      alert('Error accessing microphone. Please ensure you have granted microphone permissions.');
      setIsRecording(false);
    }
  };

  //ui
  if (!isLoggedIn) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <div className="auth-side-panel">
            <div className="auth-brand">
              <span className="logo">AI DEBATE COACH</span>
            </div>
            <div className="auth-hero-copy">
              <h2>Sharpen your arguments.</h2>
              <p>Practice smarter debates, get instant AI feedback, and build confidence in every conversation.</p>
            </div>
            <div className="auth-footer-copy">
              <p>Build your debate skills with real-time coaching and guided improvement.</p>
            </div>
          </div>

          <div className="auth-form-panel">
            <div className="auth-panel-header">
              <div>
                <h1>{authMode === 'register' ? 'Create an account' : 'Welcome back'}</h1>
                <p>{authMode === 'register' ? 'Get started with your AI Debate Coach.' : 'Log in to continue your practice.'}</p>
              </div>
            </div>
            <div className="auth-toggle">
              <button className={authMode === 'register' ? 'active' : ''} onClick={() => setAuthMode('register')} type="button">Create account</button>
              <button className={authMode === 'login' ? 'active' : ''} onClick={() => setAuthMode('login')} type="button">Log in</button>
            </div>

            {authMode === 'register' ? (
              <form className="auth-form" onSubmit={handleRegister}>
                <input
                  type="text"
                  placeholder="Username"
                  value={registerForm.username}
                  onChange={e => setRegisterForm({...registerForm, username: e.target.value})}
                  required
                />
                <input
                  type="email"
                  placeholder="Email"
                  value={registerForm.email}
                  onChange={e => setRegisterForm({...registerForm, email: e.target.value})}
                  required
                />
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={registerForm.password}
                  onChange={e => setRegisterForm({...registerForm, password: e.target.value})}
                  required
                />
                <button type="submit" className="auth-submit">Create account</button>
                <p className="auth-switch-text">Already have an account? <button type="button" className="link-button" onClick={() => setAuthMode('login')}>Log in</button></p>
              </form>
            ) : (
              <form className="auth-form" onSubmit={handleLogin}>
                <input
                  type="text"
                  placeholder="Username"
                  value={loginForm.username}
                  onChange={e => setLoginForm({...loginForm, username: e.target.value})}
                  required
                />
                <input
                  type="password"
                  placeholder="Enter your password"
                  value={loginForm.password}
                  onChange={e => setLoginForm({...loginForm, password: e.target.value})}
                  required
                />
                <button type="submit" className="auth-submit">Login</button>
                <p className="auth-switch-text">New here? <button type="button" className="link-button" onClick={() => setAuthMode('register')}>Create account</button></p>
              </form>
            )}

            <div className="auth-divider">Or register with</div>
            <div className="auth-social-buttons">
              <button type="button" className="social-button google">Google</button>
              <button type="button" className="social-button apple">Apple</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="App">
      <h1>AI DEBATE COACH</h1>
      <h3>The AI Powered Debate Assistant.</h3>

      {/* Authentication Section */}
      <div className="auth-section">
        <div className="user-info">
          <span>Welcome, {currentUser?.username}!</span>
          <button onClick={loadSearchHistory}>View History</button>
          <button onClick={handleLogout}>Logout</button>
        </div>
      </div>

      {showHistory && (
        <div className="modal-overlay" onClick={() => setShowHistory(false)}>
          <div className="modal history-modal" onClick={e => e.stopPropagation()}>
            <h2>Search History</h2>
            <div className="history-list">
              {searchHistory.length === 0 ? (
                <p>No search history found.</p>
              ) : (
                searchHistory.map((item: any) => (
                  <div key={item.id} className="history-item">
                    <h3>{item.topic}</h3>
                    <p><strong>Your Argument:</strong> {item.transcription}</p>
                    <p><strong>AI Response:</strong> {item.rebuttal}</p>
                    <small>{new Date(item.created_at).toLocaleString()}</small>
                  </div>
                ))
              )}
            </div>
            <button onClick={() => setShowHistory(false)}>Close</button>
          </div>
        </div>
      )}

      <div className="input-group">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="Enter debate topic"
          disabled={isRecording}
        />
        {!isRecording ? (
          <button 
            onClick={handleStartRecording}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : 'Start Debate'}
          </button>
        ) : (
          <button 
            onClick={handleStopRecording}
            className="recording"
          >
            Stop Recording
          </button>
        )}
      </div>

      {isRecording && (
        <div className="recording-status">
          <p>Recording in progress... Speak your argument</p>
          {liveTranscription && (
            <div className="live-transcription">
              <h3>Live Transcription:</h3>
              <p>{liveTranscription}</p>
            </div>
          )}
        </div>
      )}

      {transcription && (
        <div className="debate-section">
          <h2>Your Argument</h2>
          <p>{transcription}</p>
        </div>
      )}

      {rebuttal && (
        <div className="debate-section">
          <h2> Debatable's Response</h2>
          <p>{rebuttal}</p>
          <div className="audio-controls">
            <button 
              onClick={() => speakText(rebuttal)}
              disabled={isSpeaking && !isPaused}
              className={isSpeaking && !isPaused ? 'speaking' : ''}
            >
              {isSpeaking && !isPaused ? 'Speaking...' : 'Play Response'}
            </button>
            <button
              onClick={pauseSpeech}
              disabled={!isSpeaking || isPaused}
            >
              Pause
            </button>
            <button
              onClick={resumeSpeech}
              disabled={!isPaused}
            >
              Resume
            </button>
            <button
              onClick={stopSpeech}
              disabled={!isSpeaking && !isPaused}
            >
              Stop
            </button>
          </div>
          <div className="volume-control">
            <label htmlFor="volume">Volume: {Math.round(volume * 100)}%</label>
            <input
              id="volume"
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={volume}
              onChange={(e) => setVolume(Number(e.target.value))}
            />
          </div>
        </div>
      )}

      {analysis && (
        <div className="analysis-section">
          <h2>Debate Analysis</h2>
          <div className="analysis-content">
            {parseAnalysis(analysis)}
          </div>
        </div>
      )}
    </div>
  );
}

declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

export default App;
