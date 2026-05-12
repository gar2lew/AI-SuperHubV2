import { useRef, useState } from 'react';
import { Mic, Pause, Play, Radio, Square, Volume2 } from 'lucide-react';
import { speechToText, textToSpeechArtifact } from '@/lib/providers/puter/speech';

const VOICES = ['default', 'Joanna', 'Matthew', 'Amy'];

export function VoiceWorkspace() {
  const [text, setText] = useState('');
  const [voice, setVoice] = useState(VOICES[0]);
  const [status, setStatus] = useState('Idle');
  const [recording, setRecording] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [volume, setVolume] = useState(0.85);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const speak = async () => {
    if (!text.trim()) return;
    setStatus('Synthesizing');
    try {
      const artifact = await textToSpeechArtifact(text, { voice });
      const audio = new Audio(artifact.url);
      audio.playbackRate = speed;
      audio.volume = volume;
      audioRef.current = audio;
      audio.onplay = () => setStatus('Playing');
      audio.onpause = () => setStatus('Paused');
      audio.onended = () => setStatus('Idle');
      await audio.play();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'TTS failed');
    }
  };

  const toggleRecording = async () => {
    if (recording) {
      mediaRecorderRef.current?.stop();
      setRecording(false);
      return;
    }

    setStatus('Listening');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setStatus('Microphone unavailable');
      return;
    }
    chunksRef.current = [];
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
    recorder.onstop = async () => {
      stream.getTracks().forEach((track) => track.stop());
      setStatus('Transcribing');
      try {
        const transcript = await speechToText(new Blob(chunksRef.current, { type: 'audio/webm' }));
        setText((prev) => (prev ? `${prev}\n${transcript}` : transcript));
        setStatus('Idle');
      } catch (error) {
        setStatus(error instanceof Error ? error.message : 'STT failed');
      }
    };
    recorder.start();
    setRecording(true);
  };

  return (
    <section className="workspace-surface voice-surface">
      <div className="workspace-header">
        <div>
          <h1>Voice Workspace</h1>
          <p>Speech in, speech out, still flowing through multimodal parts.</p>
        </div>
        <span className={`status-pill ${recording || status === 'Playing' ? 'is-active' : ''}`}>{status}</span>
      </div>

      <div className="voice-controls">
        <button onClick={speak} className="voice-button" title="Play speech" aria-label="Play speech">
          <Play size={22} />
        </button>
        <button onClick={() => audioRef.current?.pause()} className="voice-button" title="Pause speech" aria-label="Pause speech">
          <Pause size={22} />
        </button>
        <button onClick={toggleRecording} className={`voice-button ${recording ? 'is-recording' : ''}`} title="Record" aria-label={recording ? 'Stop recording' : 'Start recording'}>
          {recording ? <Square size={22} /> : <Mic size={22} />}
        </button>
      </div>

      <div className={`waveform ${status === 'Playing' || recording ? 'is-active' : ''}`} aria-hidden="true">
        {Array.from({ length: 28 }, (_, index) => (
          <span key={index} style={{ height: `${20 + ((index * 11) % 54)}%` }} />
        ))}
      </div>

      <div className="workspace-control-row">
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Enter text for TTS or record microphone input for STT..."
          className="workspace-textarea"
          rows={6}
          aria-label="Voice text"
        />
        <div className="workspace-actions">
          <select value={voice} onChange={(event) => setVoice(event.target.value)} className="workspace-select" aria-label="Voice selection">
            {VOICES.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <label className="range-control">
            <span>Speed {speed.toFixed(2)}x</span>
            <input
              type="range"
              min="0.75"
              max="1.5"
              step="0.05"
              value={speed}
              onChange={(event) => setSpeed(Number(event.target.value))}
            />
          </label>
          <label className="range-control">
            <span className="inline-flex items-center gap-1">
              <Volume2 size={13} />
              Volume {Math.round(volume * 100)}%
            </span>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={volume}
              onChange={(event) => {
                const next = Number(event.target.value);
                setVolume(next);
                if (audioRef.current) audioRef.current.volume = next;
              }}
            />
          </label>
          <span className="inline-flex items-center gap-2 text-xs text-text-muted">
            <Radio size={14} />
            Audio attachments ready
          </span>
        </div>
      </div>
    </section>
  );
}
