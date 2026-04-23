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
  const [profileData, setProfileData] = useState({ username: '', email: '', avatar: '' });
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [stats] = useState({
    totalDebates: 48,
    winRate: 72,
    averageScore: 8.3,
    weakAreas: 'Logic Structure'
  });
  // Multi-round debate state
  const [debateRounds, setDebateRounds] = useState<{roundNum: number; userArg: string; aiResponse: string; analysis: string}[]>([]);
  const [debateActive, setDebateActive] = useState(false);
  const [debateSessionEnded, setDebateSessionEnded] = useState(false);
  const [currentRound, setCurrentRound] = useState(0);
  const debateChatRef = useRef<HTMLDivElement>(null);
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
      recognition.lang = 'en-US';  // ← always English

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
      if (!token) return;  // not logged in, skip silently
      const response = await axios.get('http://localhost:8000/history', {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSearchHistory(response.data);
      setShowHistory(true);
    } catch (error) {
      console.warn('Could not load history:', error);  // silent — no alert
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

  // End the entire debate session
  const handleStopDebateSession = () => {
    handleStopRecording();
    setDebateActive(false);
    setDebateSessionEnded(true);
  };

  //start recording 
  const handleStartRecording = async (isNewSession = false) => {
    if (!topic) {
      alert("Please enter a debate topic.");
      return;
    }

    if (isNewSession) {
      // Fresh session: reset everything
      setDebateRounds([]);
      setCurrentRound(0);
      setDebateSessionEnded(false);
    }

    setDebateActive(true);
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

          // Push this exchange as a new round
          const roundNum = currentRound + 1;
          setCurrentRound(roundNum);
          setDebateRounds(prev => [...prev, {
            roundNum,
            userArg: response.data.transcription,
            aiResponse: response.data.rebuttal,
            analysis: response.data.analysis,
          }]);

          // Scroll chat to bottom
          setTimeout(() => {
            debateChatRef.current?.scrollTo({ top: debateChatRef.current.scrollHeight, behavior: 'smooth' });
          }, 100);

          // Speak the rebuttal
          speakText(response.data.rebuttal);

          // Refresh history so Analytics updates immediately
          if (isLoggedIn) loadSearchHistory();
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
        <p className="dashboard-subtitle">Welcome back, {currentUser?.username}! 👋</p>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon">📊</div>
          <div className="stat-content">
            <p className="stat-label">Total Debates</p>
            <p className="stat-value">{stats.totalDebates === 0 ? '—' : stats.totalDebates}</p>
            <p className="stat-sublabel">{stats.totalDebates === 0 ? 'No debates yet' : `Debate #${stats.totalDebates} completed`}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🎯</div>
          <div className="stat-content">
            <p className="stat-label">Win Rate</p>
            <p className="stat-value">{stats.totalDebates === 0 ? '—' : `${stats.winRate}%`}</p>
            <p className="stat-sublabel">{stats.totalDebates === 0 ? 'Start debating!' : 'Score ≥ 7.5'}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">⭐</div>
          <div className="stat-content">
            <p className="stat-label">Avg Score</p>
            <p className="stat-value">{stats.totalDebates === 0 ? '—' : `${stats.averageScore}/10`}</p>
            <p className="stat-sublabel">{stats.totalDebates === 0 ? 'No data yet' : 'Across all debates'}</p>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon">🔥</div>
          <div className="stat-content">
            <p className="stat-label">With Arguments</p>
            <p className="stat-value">{0}</p>
            <p className="stat-sublabel">Substantive debates</p>
          </div>
        </div>
      </div>

      <div className="action-buttons-grid">
        <button className="action-button primary" onClick={() => setCurrentPage('debate')}>
          <span className="button-icon">🎙️</span>
          <span className="button-text">Start Debate</span>
        </button>
        <button className="action-button secondary" onClick={() => { setCurrentPage('history'); loadSearchHistory(); }}>
          <span className="button-icon">📜</span>
          <span className="button-text">View History</span>
        </button>
        <button className="action-button secondary" onClick={() => { setCurrentPage('analytics'); loadSearchHistory(); }}>
          <span className="button-icon">📈</span>
          <span className="button-text">Analytics</span>
        </button>
      </div>

      <div className="recent-debates">
        <h2 className="section-title">Recent Debates</h2>
        <div className="debates-list">
          {searchHistory.length === 0 ? (
            <div className="empty-state">
              <p className="empty-icon">🎤</p>
              <p className="empty-title">No debates yet</p>
              <p className="empty-desc">Click "Start Debate" to begin your first debate session!</p>
            </div>
          ) : (
            searchHistory.slice(0, 5).map((item: any, index: number) => (
              <div key={item.id} className="debate-item">
                <div className="debate-number">#{searchHistory.length - index}</div>
                <div className="debate-item-main">
                  <div className="debate-header">
                    <h3 className="debate-topic">{item.topic}</h3>
                    <span className="debate-date">
                      {new Date(item.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                  <div className="debate-stats">
                    <span className={`debate-badge ${item.transcription && item.transcription.length > 10 ? 'badge-with-args' : 'badge-no-args'}`}>
                      {item.transcription && item.transcription.length > 10 ? '✓ With Arguments' : '⚬ No Arguments'}
                    </span>
                    <span className="debate-time-badge">
                      🕐 {new Date(item.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Quick Argument Analyser ── */}
      <div className="dash-analyser-section">
        <div className="dash-analyser-header">
          <div className="dash-analyser-title-row">
            <span className="dash-analyser-icon">🔬</span>
            <div>
              <h2 className="dash-analyser-title">Quick Argument Analyser</h2>
              <p className="dash-analyser-sub">Paste or type any argument to get instant scores, tone detection &amp; structured feedback</p>
            </div>
          </div>
        </div>
        { /* analyser removed */ }
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
          <button className={`nav-item ${currentPage === 'history' ? 'active' : ''}`} onClick={() => { setCurrentPage('history'); loadSearchHistory(); }}>
            <span className="nav-icon">📜</span>
            <span className="nav-text">History</span>
          </button>
          <button className={`nav-item ${currentPage === 'analytics' ? 'active' : ''}`} onClick={() => { setCurrentPage('analytics'); loadSearchHistory(); }}>
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

            {/* ── Top bar: topic + round counter ── */}
            <div className="debate-top-bar">
              <div className="debate-topic-display">{topic || 'Enter a debate topic'}</div>
              {debateActive && (
                <div className="debate-round-badge">Round {currentRound + (isRecording || isLoading ? 1 : 0)}</div>
              )}
            </div>

            {/* ── AI Avatar ── */}
            <div className="ai-avatar-section">
              <div className="ai-avatar">
                <div className="avatar-glow"></div>
                <div className="avatar-core"></div>
                <div className="hologram-flicker"></div>
              </div>
              <div className={`volume-equalizer ${equalizerActive ? 'active' : ''}`}>
                {[...Array(8)].map((_, i) => <div key={i} className="eq-bar"></div>)}
              </div>
            </div>

            {/* ── Topic input + Start Session (only before a session begins) ── */}
            {!debateActive && !debateSessionEnded && (
              <div className="debate-input-section">
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="Enter debate topic…"
                  className="debate-topic-input"
                />
                <button
                  onClick={() => handleStartRecording(true)}
                  disabled={isLoading || !topic.trim()}
                  className="debate-start-btn"
                >
                  {isLoading ? '⏳ Processing...' : '🎙️ Start Debate'}
                </button>
              </div>
            )}

            {/* ── Multi-round chat scroll area ── */}
            {debateRounds.length > 0 && (
              <div className="debate-chat-scroll" ref={debateChatRef}>
                {debateRounds.map((round) => (
                  <div key={round.roundNum} className="debate-round-block">
                    <div className="round-label">Round {round.roundNum}</div>

                    {/* User bubble */}
                    <div className="transcript-bubble user-bubble">
                      <p className="bubble-label">🧑 Your Argument</p>
                      <p>{round.userArg}</p>
                    </div>

                    {/* AI bubble */}
                    <div className="transcript-bubble ai-bubble">
                      <p className="bubble-label">🤖 AI Response</p>
                      <p>{round.aiResponse}</p>
                      <div className="audio-controls">
                        <button onClick={() => speakText(round.aiResponse)} disabled={isSpeaking && !isPaused}>
                          {isSpeaking && !isPaused ? '🔊 Speaking...' : '🔊 Play'}
                        </button>
                        <button onClick={pauseSpeech} disabled={!isSpeaking || isPaused}>⏸️ Pause</button>
                        <button onClick={resumeSpeech} disabled={!isPaused}>▶️ Resume</button>
                        <button onClick={stopSpeech} disabled={!isSpeaking && !isPaused}>⏹️ Stop</button>
                      </div>
                    </div>

                    {/* Analysis (collapsed) */}
                    {round.analysis && (
                      <details className="round-analysis-details">
                        <summary>📊 View Round {round.roundNum} Analysis</summary>
                        <div className="analysis-content">{parseAnalysis(round.analysis)}</div>
                      </details>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* ── Recording status ── */}
            {isRecording && (
              <div className="recording-status">
                <span className="rec-dot" />
                <p>🎙️ Recording Round {currentRound + 1}… Speak your argument</p>
                {liveTranscription && (
                  <div className="live-transcription"><p>{liveTranscription}</p></div>
                )}
              </div>
            )}

            {/* ── Loading ── */}
            {isLoading && (
              <div className="recording-status">
                <span className="rec-dot processing" />
                <p>⏳ AI is thinking… processing Round {currentRound + 1}</p>
              </div>
            )}

            {/* ── Continue / Stop controls (shown after each AI response, while session active) ── */}
            {debateActive && !isRecording && !isLoading && debateRounds.length > 0 && !debateSessionEnded && (
              <div className="debate-continue-bar">
                {!isRecording ? (
                  <button className="debate-continue-btn" onClick={() => handleStartRecording(false)}>
                    🎙️ Continue Debate (Round {currentRound + 1})
                  </button>
                ) : null}
                <button className="debate-stop-session-btn" onClick={handleStopDebateSession}>
                  🛑 Stop Debate
                </button>
              </div>
            )}

            {/* ── Active recording: only show Stop Recording button ── */}
            {debateActive && isRecording && (
              <div className="debate-continue-bar">
                <button className="debate-stop-btn" onClick={handleStopRecording}>
                  ⏹️ Stop Recording
                </button>
                <button className="debate-stop-session-btn" onClick={handleStopDebateSession}>
                  🛑 End Debate
                </button>
              </div>
            )}

            {/* ── Session ended summary ── */}
            {debateSessionEnded && debateRounds.length > 0 && (
              <div className="debate-summary-card">
                <div className="summary-icon">🏆</div>
                <h3>Debate Completed!</h3>
                <p className="summary-meta">
                  Topic: <strong>{topic}</strong> · {debateRounds.length} round{debateRounds.length > 1 ? 's' : ''} completed
                </p>
                <div className="summary-stats">
                  <div className="summary-stat">
                    <span className="summary-stat-val">{debateRounds.length}</span>
                    <span className="summary-stat-label">Rounds</span>
                  </div>
                  <div className="summary-stat">
                    <span className="summary-stat-val">
                      {debateRounds.filter(r => r.userArg && r.userArg.length > 20).length}
                    </span>
                    <span className="summary-stat-label">Full Arguments</span>
                  </div>
                  <div className="summary-stat">
                    <span className="summary-stat-val">
                      {debateRounds.reduce((sum, r) => sum + r.userArg.split(' ').length, 0)}
                    </span>
                    <span className="summary-stat-label">Total Words</span>
                  </div>
                </div>
                <div className="summary-actions">
                  <button className="debate-start-btn" onClick={() => {
                    setDebateSessionEnded(false);
                    setDebateActive(false);
                    setDebateRounds([]);
                    setCurrentRound(0);
                    setTopic('');
                  }}>
                    🎙️ Start New Debate
                  </button>
                  <button className="action-button secondary" onClick={() => { setCurrentPage('history'); loadSearchHistory(); }}>
                    📜 View History
                  </button>
                </div>
              </div>
            )}

          </div>
          )}


          {currentPage === 'history' && (
            <div className="history-page">
              <div className="page-header">
                <h2>Debate History</h2>
                <span className="history-count">{searchHistory.length} total debates</span>
              </div>
              <div className="history-list">
                {searchHistory.length === 0 ? (
                  <div className="empty-state">
                    <p className="empty-icon">📜</p>
                    <p className="empty-title">No history yet</p>
                    <p className="empty-desc">Your debate sessions will appear here with full timestamps.</p>
                  </div>
                ) : (
                  searchHistory.map((item: any, index: number) => {
                    const dateObj = new Date(item.created_at);
                    const hasArgs = item.transcription && item.transcription.length > 10;
                    return (
                      <div key={item.id} className="history-card">
                        <div className="history-card-header">
                          <div className="history-card-left">
                            <span className="history-debate-num">#{searchHistory.length - index}</span>
                            <h3 className="history-topic">{item.topic}</h3>
                          </div>
                          <div className="history-card-right">
                            <span className={`arg-badge ${hasArgs ? 'arg-badge--with' : 'arg-badge--without'}`}>
                              {hasArgs ? '✓ With Arguments' : '⚬ No Arguments'}
                            </span>
                          </div>
                        </div>
                        <div className="history-datetime">
                          <span className="history-date-icon">📅</span>
                          <span className="history-date-text">
                            {dateObj.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' })}
                          </span>
                          <span className="history-time-sep">•</span>
                          <span className="history-time-icon">🕐</span>
                          <span className="history-time-text">
                            {dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true })}
                          </span>
                        </div>
                        {hasArgs && (
                          <div className="history-body">
                            <div className="history-arg">
                              <p className="history-arg-label">Your Argument</p>
                              <p className="history-arg-text">{item.transcription.length > 200 ? item.transcription.substring(0, 200) + '...' : item.transcription}</p>
                            </div>
                            {item.rebuttal && (
                              <div className="history-rebuttal">
                                <p className="history-arg-label">AI Rebuttal</p>
                                <p className="history-arg-text">{item.rebuttal.length > 200 ? item.rebuttal.substring(0, 200) + '...' : item.rebuttal}</p>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
          {currentPage === 'analytics' && (() => {
            // ── Live-computed analytics from searchHistory ──
            const withArgs = searchHistory.filter((d: any) => d.transcription && d.transcription.trim().length > 10).length;
            const total = searchHistory.length;
            const withArgsPct = total > 0 ? Math.round((withArgs / total) * 100) : 0;
            const avgLen = withArgs > 0
              ? Math.round(searchHistory.filter((d: any) => d.transcription && d.transcription.trim().length > 10)
                  .reduce((s: number, d: any) => s + d.transcription.length, 0) / withArgs)
              : 0;
            const avgScore = total > 0
              ? Math.round((searchHistory.reduce((s: number, d: any) => s + (d.score || 0), 0) / total) * 10) / 10
              : 0;
            const topicMap: Record<string, number> = {};
            searchHistory.forEach((d: any) => { if (d.topic) topicMap[d.topic] = (topicMap[d.topic] || 0) + 1; });
            const topTopic = Object.keys(topicMap).sort((a, b) => topicMap[b] - topicMap[a])[0] || '—';
            const engRate = total > 0 ? Math.round((withArgs / total) * 100) : 0;

            // ── Extract weak points from analysis texts ──
            const weakPoints: {topic: string; point: string}[] = [];
            searchHistory.slice(0, 8).forEach((d: any) => {
              if (!d.analysis) return;
              const analysisText: string = d.analysis;
              // grab sentences that contain weakness keywords
              const sentences = analysisText.split(/[.!\n]+/).map((s: string) => s.trim()).filter((s: string) => s.length > 20);
              const weakSentences = sentences.filter((s: string) =>
                /weak|improv|lack|miss|unclear|vague|avoid|fail|poor|limit|more evidence|not enough|unsupport/i.test(s)
              );
              weakSentences.slice(0, 2).forEach((pt: string) => {
                weakPoints.push({ topic: d.topic || 'Debate', point: pt });
              });
            });

            return (
              <div className="analytics-page">
                <div className="page-header">
                  <h2>Your Analytics</h2>
                  <span className="history-count">{total} debates analyzed</span>
                </div>

                {/* ── Top row: With Arguments + Feedback ── */}
                <div className="analytics-overview">

                  {/* Card 1: Debates WITH Arguments */}
                  <div className="analytics-card analytics-card--primary">
                    <div className="analytics-card-icon">&#x1F5E3;</div>
                    <div className="analytics-card-body">
                      <p className="analytics-card-label">Debates WITH Arguments</p>
                      <p className="analytics-card-value">{withArgs}</p>
                      <p className="analytics-card-desc">You actively argued your position</p>
                    </div>
                    <div className="analytics-progress-ring">
                      <svg viewBox="0 0 60 60" width="60" height="60">
                        <circle cx="30" cy="30" r="24" fill="none" stroke="rgba(127,90,240,0.15)" strokeWidth="6"/>
                        <circle
                          cx="30" cy="30" r="24" fill="none" stroke="#7F5AF0" strokeWidth="6"
                          strokeDasharray={`${(withArgsPct / 100) * 150.8} 150.8`}
                          strokeLinecap="round" transform="rotate(-90 30 30)"
                        />
                      </svg>
                      <span className="ring-pct">{withArgsPct}%</span>
                    </div>
                  </div>

                  {/* Card 2: Feedback – Key Weak Points */}
                  <div className="analytics-card analytics-card--feedback">
                    <div className="analytics-card-icon">&#x26A0;</div>
                    <div className="analytics-card-body" style={{flex:1}}>
                      <p className="analytics-card-label">Feedback &mdash; Key Weak Points</p>
                      {weakPoints.length === 0 ? (
                        <p className="analytics-card-desc" style={{marginTop:'0.5rem'}}>
                          {total === 0
                            ? 'Complete a debate to see your weak points.'
                            : 'No specific weak points detected yet — great work!'}
                        </p>
                      ) : (
                        <ul className="weak-points-list">
                          {weakPoints.slice(0, 5).map((wp, i) => (
                            <li key={i} className="weak-point-item">
                              <span className="weak-point-topic">{wp.topic}</span>
                              <span className="weak-point-text">{wp.point}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>

                </div>

                {/* ── Stats row ── */}
                <div className="analytics-stats-row">
                  <div className="analytics-stat-box">
                    <p className="analytics-stat-label">Avg Argument Length</p>
                    <p className="analytics-stat-val">{avgLen} <span>chars</span></p>
                  </div>
                  <div className="analytics-stat-box">
                    <p className="analytics-stat-label">Average Score</p>
                    <p className="analytics-stat-val">{avgScore} <span>/ 10</span></p>
                  </div>
                  <div className="analytics-stat-box">
                    <p className="analytics-stat-label">Most Debated Topic</p>
                    <p className="analytics-stat-val" style={{fontSize:'1rem'}}>{topTopic}</p>
                  </div>
                  <div className="analytics-stat-box">
                    <p className="analytics-stat-label">Engagement Rate</p>
                    <p className="analytics-stat-val">{engRate}<span>%</span></p>
                  </div>
                </div>

                {total === 0 && (
                  <div className="empty-state" style={{marginTop:'2rem'}}>
                    <p className="empty-icon">&#x1F4CA;</p>
                    <p className="empty-title">No data yet</p>
                    <p className="empty-desc">Complete at least one debate to see your analytics.</p>
                  </div>
                )}
              </div>
            );
          })()}

          {currentPage === 'settings' && (
            <div className="settings-page">
              <div className="page-header">
                <h2>Settings</h2>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-title">👤 Profile Information</h3>
                <div className="profile-card">
                  <div className="profile-avatar-wrapper">
                    <div className="profile-avatar-circle">
                      {(currentUser?.username || 'U')[0].toUpperCase()}
                    </div>
                    <div className="profile-avatar-glow"></div>
                  </div>
                  <div className="profile-info">
                    {isEditingProfile ? (
                      <div className="profile-edit-form">
                        <div className="profile-field">
                          <label>Username</label>
                          <input
                            type="text"
                            value={profileData.username}
                            onChange={e => setProfileData({...profileData, username: e.target.value})}
                            className="profile-input"
                          />
                        </div>
                        <div className="profile-field">
                          <label>Email</label>
                          <input
                            type="email"
                            value={profileData.email}
                            onChange={e => setProfileData({...profileData, email: e.target.value})}
                            className="profile-input"
                            readOnly
                          />
                        </div>
                        <div className="profile-edit-actions">
                          <button
                            className="profile-save-btn"
                            onClick={() => setIsEditingProfile(false)}
                          >
                            ✓ Save Changes
                          </button>
                          <button
                            className="profile-cancel-btn"
                            onClick={() => {
                              setProfileData({ username: currentUser?.username || '', email: currentUser?.email || '', avatar: '' });
                              setIsEditingProfile(false);
                            }}
                          >
                            ✕ Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="profile-view">
                        <div className="profile-detail-row">
                          <span className="profile-detail-label">Username</span>
                          <span className="profile-detail-value">{profileData.username || currentUser?.username}</span>
                        </div>
                        <div className="profile-detail-row">
                          <span className="profile-detail-label">Email</span>
                          <span className="profile-detail-value">{profileData.email || currentUser?.email}</span>
                        </div>
                        <div className="profile-detail-row">
                          <span className="profile-detail-label">Member Since</span>
                          <span className="profile-detail-value">
                            {currentUser?.created_at ? new Date(currentUser.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '—'}
                          </span>
                        </div>
                        <div className="profile-detail-row">
                          <span className="profile-detail-label">Total Debates</span>
                          <span className="profile-detail-value highlight">{stats.totalDebates}</span>
                        </div>
                        <button
                          className="profile-edit-btn"
                          onClick={() => setIsEditingProfile(true)}
                        >
                          ✏️ Edit Profile
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-title">🏆 Performance Summary</h3>
                <div className="settings-stats-grid">
                  <div className="settings-stat">
                    <p className="settings-stat-label">Total Debates</p>
                    <p className="settings-stat-val">{stats.totalDebates}</p>
                  </div>
                  <div className="settings-stat">
                    <p className="settings-stat-label">Win Rate</p>
                    <p className="settings-stat-val">{stats.winRate}%</p>
                  </div>
                  <div className="settings-stat">
                    <p className="settings-stat-label">Avg Score</p>
                    <p className="settings-stat-val">{stats.averageScore}/10</p>
                  </div>
                  <div className="settings-stat">
                    <p className="settings-stat-label">With Arguments</p>
                    <p className="settings-stat-val">{0}</p>
                  </div>
                </div>
              </div>

              <div className="settings-section">
                <h3 className="settings-section-title">🚪 Account</h3>
                <button className="settings-logout-btn" onClick={handleLogout}>
                  Sign Out
                </button>
              </div>
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
