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
  const [equalizerActive, setEqualizerActive] = useState(false);
  const [currentPage, setCurrentPage] = useState<'dashboard' | 'debate' | 'history' | 'analytics' | 'settings'>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [stats] = useState({
    totalDebates: 48,
    winRate: 72,
    averageScore: 8.3,
    weakAreas: 'Logic Structure'
  });
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

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const x = ((event.clientX / window.innerWidth) - 0.5) * 28;
      const y = ((event.clientY / window.innerHeight) - 0.5) * 28;
      document.documentElement.style.setProperty('--cursor-x', `${x}px`);
      document.documentElement.style.setProperty('--cursor-y', `${y}px`);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // Activate equalizer on user interactions
  useEffect(() => {
    const activateEqualizer = () => {
      setEqualizerActive(true);
      setTimeout(() => setEqualizerActive(false), 2000);
    };

    const handleInteraction = () => activateEqualizer();
    
    window.addEventListener('click', handleInteraction);
    window.addEventListener('keydown', handleInteraction);
    
    return () => {
      window.removeEventListener('click', handleInteraction);
      window.removeEventListener('keydown', handleInteraction);
    };
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
      <div className="auth-container">
        <div className="auth-grid-bg"></div>
        <div className="auth-flowing-lines"></div>
        
        <div className="auth-layout">
          <div className="auth-left-panel">
            <div className="neural-network">
              <div className="network-node node-1"></div>
              <div className="network-node node-2"></div>
              <div className="network-node node-3"></div>
              <div className="network-node node-4"></div>
              <div className="network-line line-1"></div>
              <div className="network-line line-2"></div>
              <div className="network-line line-3"></div>
            </div>
            <div className="auth-left-content">
              <h1 className="auth-main-title">AI DEBATE COACH</h1>
              <p className="auth-tagline">Master the Art of Debate with AI</p>
              <p className="auth-description">Experience intelligent debate coaching with real-time feedback and strategic insights.</p>
            </div>
          </div>

          <div className="auth-right-panel">
            <div className="auth-glass-card">
              <div className="auth-header">
                <h2>{authMode === 'register' ? 'Create Account' : 'Welcome Back'}</h2>
                <p>{authMode === 'register' ? 'Start your debate journey' : 'Continue practicing'}</p>
              </div>

              <div className="auth-mode-toggle">
                <button 
                  className={authMode === 'register' ? 'active' : ''} 
                  onClick={() => setAuthMode('register')}
                  type="button"
                >
                  Register
                </button>
                <button 
                  className={authMode === 'login' ? 'active' : ''} 
                  onClick={() => setAuthMode('login')}
                  type="button"
                >
                  Login
                </button>
              </div>

              {authMode === 'register' ? (
                <form className="auth-form" onSubmit={handleRegister}>
                  <div className="form-group">
                    <input
                      type="text"
                      placeholder="Username"
                      value={registerForm.username}
                      onChange={e => setRegisterForm({...registerForm, username: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <input
                      type="email"
                      placeholder="Email address"
                      value={registerForm.email}
                      onChange={e => setRegisterForm({...registerForm, email: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <input
                      type="password"
                      placeholder="Password"
                      value={registerForm.password}
                      onChange={e => setRegisterForm({...registerForm, password: e.target.value})}
                      required
                    />
                  </div>
                  <button type="submit" className="auth-submit-btn">Create Account</button>
                </form>
              ) : (
                <form className="auth-form" onSubmit={handleLogin}>
                  <div className="form-group">
                    <input
                      type="text"
                      placeholder="Username"
                      value={loginForm.username}
                      onChange={e => setLoginForm({...loginForm, username: e.target.value})}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <input
                      type="password"
                      placeholder="Password"
                      value={loginForm.password}
                      onChange={e => setLoginForm({...loginForm, password: e.target.value})}
                      required
                    />
                  </div>
                  <button type="submit" className="auth-submit-btn">Sign In</button>
                </form>
              )}

              <div className="auth-divider"></div>
              <div className="social-login">
                <button type="button" className="social-btn google">Google</button>
                <button type="button" className="social-btn apple">Apple</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Dashboard Page
  const renderDashboard = () => (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1 className="dashboard-title">Dashboard</h1>
        <p className="dashboard-subtitle">Welcome back, {currentUser?.username}!</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <p className="stat-label">Total Debates</p>
            <p className="stat-value">{stats.totalDebates}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🎯</div>
          <div className="stat-content">
            <p className="stat-label">Win Rate</p>
            <p className="stat-value">{stats.winRate}%</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⭐</div>
          <div className="stat-content">
            <p className="stat-label">Avg Score</p>
            <p className="stat-value">{stats.averageScore}/10</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⚠️</div>
          <div className="stat-content">
            <p className="stat-label">Weak Area</p>
            <p className="stat-value">{stats.weakAreas}</p>
          </div>
        </div>
      </div>

      <div className="action-buttons-grid">
        <button className="action-button primary" onClick={handleStartRecording}>
          <span className="button-icon">▶️</span>
          <span className="button-text">Start Debate</span>
        </button>
        <button className="action-button secondary">
          <span className="button-icon">🎓</span>
          <span className="button-text">Practice Mode</span>
        </button>
        <button className="action-button secondary">
          <span className="button-icon">💡</span>
          <span className="button-text">AI Feedback</span>
        </button>
      </div>

      <div className="recent-debates">
        <h2 className="section-title">Recent Debates</h2>
        <div className="debates-list">
          <div className="debate-item">
            <div className="debate-header">
              <h3 className="debate-topic">Climate Change Policy</h3>
              <span className="debate-date">2 days ago</span>
            </div>
            <div className="debate-stats">
              <span className="debate-score">Score: 8.5/10</span>
              <span className="debate-duration">Duration: 12m</span>
            </div>
          </div>
          <div className="debate-item">
            <div className="debate-header">
              <h3 className="debate-topic">Technology Impact</h3>
              <span className="debate-date">1 week ago</span>
            </div>
            <div className="debate-stats">
              <span className="debate-score">Score: 7.8/10</span>
              <span className="debate-duration">Duration: 10m</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Main Dashboard with Sidebar
  return (
    <div className="app-container">
      <div className="app-grid-bg"></div>
      <div className="app-flowing-lines"></div>

      <aside className={`sidebar ${sidebarOpen ? 'open' : 'closed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">AI COACH</div>
          <button className="sidebar-toggle" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
        </div>
        <nav className="sidebar-nav">
          <button className={`nav-item ${currentPage === 'dashboard' ? 'active' : ''}`} onClick={() => setCurrentPage('dashboard')}>
            <span className="nav-icon">📊</span>
            <span className="nav-text">Dashboard</span>
          </button>
          <button className={`nav-item ${currentPage === 'debate' ? 'active' : ''}`} onClick={() => setCurrentPage('debate')}>
            <span className="nav-icon">🎙️</span>
            <span className="nav-text">Start Debate</span>
          </button>
          <button className={`nav-item ${currentPage === 'history' ? 'active' : ''}`} onClick={() => setCurrentPage('history')}>
            <span className="nav-icon">📜</span>
            <span className="nav-text">History</span>
          </button>
          <button className={`nav-item ${currentPage === 'analytics' ? 'active' : ''}`} onClick={() => setCurrentPage('analytics')}>
            <span className="nav-icon">📈</span>
            <span className="nav-text">Analytics</span>
          </button>
          <button className={`nav-item ${currentPage === 'settings' ? 'active' : ''}`} onClick={() => setCurrentPage('settings')}>
            <span className="nav-icon">⚙️</span>
            <span className="nav-text">Settings</span>
          </button>
        </nav>
        <button className="logout-btn" onClick={handleLogout}>
          <span className="nav-icon">🚪</span>
          <span className="nav-text">Logout</span>
        </button>
      </aside>

      <main className="main-content">
        <div className="content-wrapper">
          {currentPage === 'dashboard' && renderDashboard()}
          
          {currentPage === 'debate' && (
        <div className="debate-section">
          <div className="debate-top-bar">
            <div className="debate-topic-display">{topic || 'Enter a debate topic'}</div>
            <div className="debate-timer">12:34</div>
          </div>

          <div className="ai-avatar-section">
            <div className="ai-avatar">
              <div className="avatar-glow"></div>
              <div className="avatar-core"></div>
              <div className="hologram-flicker"></div>
            </div>
            <div className={`volume-equalizer ${equalizerActive ? 'active' : ''}`}>
              <div className="eq-bar"></div>
              <div className="eq-bar"></div>
              <div className="eq-bar"></div>
              <div className="eq-bar"></div>
              <div className="eq-bar"></div>
              <div className="eq-bar"></div>
              <div className="eq-bar"></div>
              <div className="eq-bar"></div>
            </div>
          </div>

          <div className="debate-input-section">
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="Enter debate topic"
              disabled={isRecording}
              className="debate-topic-input"
            />
            {!isRecording ? (
              <button 
                onClick={handleStartRecording}
                disabled={isLoading}
                className="debate-start-btn"
              >
                {isLoading ? '⏳ Processing...' : '▶️ Start Recording'}
              </button>
            ) : (
              <button 
                onClick={handleStopRecording}
                className="debate-stop-btn"
              >
                ⏹️ Stop Recording
              </button>
            )}
          </div>

          {isRecording && (
            <div className="recording-status">
              <p>🎙️ Recording in progress... Speak your argument</p>
              {liveTranscription && (
                <div className="live-transcription">
                  <p>{liveTranscription}</p>
                </div>
              )}
            </div>
          )}

          {transcription && (
            <div className="debate-transcript">
              <div className="transcript-bubble user-bubble">
                <p className="bubble-label">Your Argument</p>
                <p>{transcription}</p>
              </div>
            </div>
          )}

          {rebuttal && (
            <div className="debate-transcript">
              <div className="transcript-bubble ai-bubble">
                <p className="bubble-label">AI Response</p>
                <p>{rebuttal}</p>
              </div>
              <div className="audio-controls">
                <button onClick={() => speakText(rebuttal)} disabled={isSpeaking && !isPaused}>
                  {isSpeaking && !isPaused ? '🔊 Speaking...' : '🔊 Play'}
                </button>
                <button onClick={pauseSpeech} disabled={!isSpeaking || isPaused}>⏸️ Pause</button>
                <button onClick={resumeSpeech} disabled={!isPaused}>▶️ Resume</button>
                <button onClick={stopSpeech} disabled={!isSpeaking && !isPaused}>⏹️ Stop</button>
              </div>
            </div>
          )}

          {analysis && (
            <div className="analysis-section">
              <h3>Debate Analysis</h3>
              <div className="analysis-content">
                {parseAnalysis(analysis)}
              </div>
            </div>
          )}
        </div>
          )}

          {currentPage === 'history' && (
            <div className="history-page">
              <h2>Debate History</h2>
              {showHistory && (
                <div className="history-list">
                  {searchHistory.length === 0 ? (
                    <p>No debates yet.</p>
                  ) : (
                    searchHistory.map((item: any) => (
                      <div key={item.id} className="history-card">
                        <h3>{item.topic}</h3>
                        <p><strong>Your Argument:</strong> {item.transcription}</p>
                        <p><strong>AI Response:</strong> {item.rebuttal}</p>
                        <small>{new Date(item.created_at).toLocaleString()}</small>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {currentPage === 'analytics' && (
            <div className="analytics-page">
              <h2>Your Analytics</h2>
              <p>Analytics coming soon...</p>
            </div>
          )}

          {currentPage === 'settings' && (
            <div className="settings-page">
              <h2>Settings</h2>
              <p>Settings coming soon...</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

declare global {
  interface Window {
    webkitSpeechRecognition: any;
  }
}

export default App;
