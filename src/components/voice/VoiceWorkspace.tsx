import { useEffect, useRef, useState } from 'react';
import { Mic, Pause, Play, Radio, Square, Volume2 } from 'lucide-react';
import { speechToText, textToSpeechArtifact } from '@/lib/providers/puter/speech';
import { formatProviderError } from '@/lib/providers/errors';
import { trackMediaTrackAcquired, trackMediaTrackReleased, trackObjectUrlRevoked } from '@/lib/diagnostics/resourceTracker';
import { useWorkstationStore } from '@/store/workstationStore';

const VOICES = ['default', 'Joanna', 'Matthew', 'Amy'];

export function VoiceWorkspace() {
  const savedState = useWorkstationStore((s) => s.voiceWorkspace);
  const updateVoiceWorkspace = useWorkstationStore((s) => s.updateVoiceWorkspace);
  const [text, setText] = useState(savedState.text);
  const [voice, setVoice] = useState(savedState.voice || VOICES[0]);
  const [status, setStatus] = useState('Idle');
  const [recording, setRecording] = useState(false);
  const [speed, setSpeed] = useState(savedState.speed);
  const [volume, setVolume] = useState(savedState.volume);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioObjectUrlRef = useRef<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const speak = async () => {
    if (!text.trim()) return;
    setStatus('Synthesizing');
    try {
      cleanupAudio();
      const artifact = await textToSpeechArtifact(text, { voice });
      const audio = new Audio(artifact.url);
      audio.playbackRate = speed;
      audio.volume = volume;
      audioRef.current = audio;
      audioObjectUrlRef.current = artifact.blob ? artifact.url : null;
      audio.onplay = () => setStatus('Playing');
      audio.onpause = () => setStatus('Paused');
      audio.onended = () => {
        cleanupAudio();
        window.setTimeout(() => setStatus('Idle'), 1000);
      };
      audio.onerror = () => {
        setStatus('Playback failed');
        cleanupAudio();
      };
      await audio.play();
    } catch (error) {
      cleanupAudio();
      setStatus(formatProviderError(error, 'TTS failed'));
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
      trackMediaTrackAcquired(stream.getTracks().length);
    } catch {
      setStatus('Microphone unavailable');
      return;
    }
    chunksRef.current = [];
    mediaStreamRef.current = stream;
    const recorder = new MediaRecorder(stream);
    mediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => chunksRef.current.push(event.data);
    recorder.onstop = async () => {
      cleanupMediaStream();
      setStatus('Transcribing');
      try {
        const transcript = await speechToText(new Blob(chunksRef.current, { type: 'audio/webm' }));
        setText((prev) => {
          const next = prev ? `${prev}\n${transcript}` : transcript;
          updateVoiceWorkspace({ text: next });
          return next;
        });
        setStatus('Idle');
      } catch (error) {
        setStatus(formatProviderError(error, 'STT failed'));
      }
    };
    recorder.start();
    setRecording(true);
  };

  useEffect(() => {
    return () => {
      cleanupAudio();
      try {
        if (mediaRecorderRef.current?.state === 'recording') {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // Recorder cleanup should never block workspace unmount.
      }
      cleanupMediaStream();
    };
  }, []);

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
        <button onClick={() => {
          audioRef.current?.pause();
          cleanupAudio();
          setStatus('Paused');
        }} className="voice-button" title="Pause speech" aria-label="Pause speech">
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
          onChange={(event) => {
            setText(event.target.value);
            updateVoiceWorkspace({ text: event.target.value });
          }}
          placeholder="Enter text for TTS or record microphone input for STT..."
          className="workspace-textarea"
          rows={6}
          aria-label="Voice text"
        />
        <div className="workspace-actions">
          <select
            value={voice}
            onChange={(event) => {
              setVoice(event.target.value);
              updateVoiceWorkspace({ voice: event.target.value });
            }}
            className="workspace-select"
            aria-label="Voice selection"
          >
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
              onChange={(event) => {
                const next = Number(event.target.value);
                setSpeed(next);
                updateVoiceWorkspace({ speed: next });
              }}
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
                updateVoiceWorkspace({ volume: next });
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

  function cleanupAudio() {
    const audio = audioRef.current;
    if (audio) {
      audio.onplay = null;
      audio.onpause = null;
      audio.onended = null;
      audio.onerror = null;
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    }
    if (audioObjectUrlRef.current) {
      URL.revokeObjectURL(audioObjectUrlRef.current);
      trackObjectUrlRevoked(audioObjectUrlRef.current);
      audioObjectUrlRef.current = null;
    }
  }

  function cleanupMediaStream() {
    const tracks = mediaStreamRef.current?.getTracks() ?? [];
    tracks.forEach((track) => track.stop());
    trackMediaTrackReleased(tracks.length);
    mediaStreamRef.current = null;
  }
}
