/**
 * panel.js
 * Client-side script running inside the VS Code webview.
 * Receives update messages from the extension host and updates the DOM.
 * Also handles synthesized sounds via Web Audio API (no audio files required).
 */

(function () {
  'use strict';

  // ── VS Code API ─────────────────────────────────────────────────────────────
  const vscode = acquireVsCodeApi();

  // ── DOM references ──────────────────────────────────────────────────────────
  const stageBadge      = document.getElementById('stage-badge');
  const stageName       = document.getElementById('stage-name');
  const stageImg        = document.getElementById('stage-img');
  const noImgPlaceholder= document.getElementById('no-image-placeholder');
  const imageContainer  = document.getElementById('image-container');
  const statErrors      = document.getElementById('stat-errors');
  const statWarnings    = document.getElementById('stat-warnings');
  const statScore       = document.getElementById('stat-score');
  const chaosBarFill    = document.getElementById('chaos-bar-fill');
  const chaosBarLabel   = document.getElementById('chaos-bar-label');
  const statusMessage   = document.getElementById('status-message');
  const soundIndicator  = document.getElementById('sound-indicator');

  // ── State ───────────────────────────────────────────────────────────────────
  let currentStage = 1;
  let audioContext = null;
  let activeOscillators = [];
  let soundEnabled = false;

  // ── Stage configuration ─────────────────────────────────────────────────────
  const MAX_SCORE_DISPLAY = 20; // for progress bar 100% reference

  const STAGE_COLORS = [
    '#00e5a0', // 1 - green
    '#4cde8c', // 2
    '#a8d86e', // 3 - yellow-green
    '#d4c44a', // 4
    '#ffb800', // 5 - amber
    '#ff8c42', // 6 - orange
    '#ff6135', // 7
    '#ff3d3d', // 8 - red
    '#c0392b', // 9 - deep red
  ];

  const STAGE_GLOWS = [
    'rgba(0,229,160,0.3)',
    'rgba(76,222,140,0.3)',
    'rgba(168,216,110,0.3)',
    'rgba(212,196,74,0.3)',
    'rgba(255,184,0,0.35)',
    'rgba(255,140,66,0.35)',
    'rgba(255,97,53,0.4)',
    'rgba(255,61,61,0.4)',
    'rgba(192,57,43,0.5)',
  ];

  const STATUS_MESSAGES = [
    '💪 Your code is healthy!',
    '🙂 Barely a hiccup...',
    '😐 Getting a bit messy.',
    '😟 Things are piling up.',
    '😨 This is uncomfortable.',
    '😰 Seriously, fix something!',
    '😱 It\'s getting critical!',
    '🤯 The code is screaming!',
    '💀 Full uncanny breakdown.',
  ];

  const DISTORT_CLASSES = [
    'stage-distort-low',    // 1
    'stage-distort-low',    // 2
    'stage-distort-mid',    // 3
    'stage-distort-mid',    // 4
    'stage-distort-high',   // 5
    'stage-distort-high',   // 6
    'stage-distort-severe', // 7
    'stage-distort-severe', // 8
    'stage-distort-chaos',  // 9
  ];

  // ── Message handler ─────────────────────────────────────────────────────────
  window.addEventListener('message', (event) => {
    const msg = event.data;
    if (msg.type === 'update') {
      applyUpdate(msg);
    }
  });

  // ── Apply state update ──────────────────────────────────────────────────────
  function applyUpdate(state) {
    const {
      stage, stageName: name, errors, warnings,
      chaosScore, imageUri, memeMode,
    } = state;

    soundEnabled = state.soundEnabled;
    const stageChanged = stage !== currentStage;
    currentStage = stage;

    // CSS vars for color theming
    const color = STAGE_COLORS[stage - 1];
    const glow  = STAGE_GLOWS[stage - 1];
    document.documentElement.style.setProperty('--stage-color', color);
    document.documentElement.style.setProperty('--stage-glow', glow);

    // Header
    stageBadge.textContent = `Stage ${stage}`;
    stageName.textContent  = name;

    // Body class for minimal mode
    document.body.classList.toggle('minimal-mode', !memeMode);

    // Image swap (cross-fade)
    if (memeMode) {
      updateImage(imageUri, stage, stageChanged);
    }

    // Stats
    animateCount(statErrors, errors);
    animateCount(statWarnings, warnings);
    animateCount(statScore, chaosScore);

    // Progress bar (cap at MAX_SCORE_DISPLAY for visual purposes)
    const pct = Math.min((chaosScore / MAX_SCORE_DISPLAY) * 100, 100);
    chaosBarFill.style.width = pct + '%';
    chaosBarLabel.textContent = chaosScore + ' / 17+';

    // Status message
    statusMessage.textContent = STATUS_MESSAGES[stage - 1];
    statusMessage.style.color = color;

    // Container effects for high stages
    imageContainer.classList.toggle('shaking',   stage >= 8);
    imageContainer.classList.toggle('pulsating', stage >= 5 && stage < 8);

    // Sound indicator
    if (soundEnabled) {
      soundIndicator.classList.remove('hidden');
      if (stageChanged) {
        playStageSound(stage);
      }
    } else {
      soundIndicator.classList.add('hidden');
      stopSounds();
    }
  }

  // ── Image update ────────────────────────────────────────────────────────────
  function updateImage(imageUri, stage, stageChanged) {
    if (!imageUri) {
      // No image file found — show placeholder
      stageImg.classList.add('hidden');
      noImgPlaceholder.classList.remove('hidden');
      return;
    }

    noImgPlaceholder.classList.add('hidden');
    stageImg.classList.remove('hidden');

    if (stageChanged) {
      // Cross-fade transition
      stageImg.classList.add('transitioning');
      setTimeout(() => {
        stageImg.src = imageUri;
        // Remove all distort classes
        stageImg.className = '';
        stageImg.classList.add(DISTORT_CLASSES[stage - 1]);
        stageImg.classList.remove('transitioning');
      }, 350);
    } else if (!stageImg.src || !stageImg.src.includes(`stage${stage}`)) {
      // First load
      stageImg.src = imageUri;
      stageImg.className = DISTORT_CLASSES[stage - 1];
    }
  }

  // ── Number counter animation ────────────────────────────────────────────────
  function animateCount(el, target) {
    const current = parseInt(el.textContent || '0', 10);
    if (current === target) { return; }

    const diff = target - current;
    const steps = Math.min(Math.abs(diff), 8);
    const step  = diff / steps;
    let val = current;
    let i = 0;

    const interval = setInterval(() => {
      i++;
      val += step;
      el.textContent = Math.round(i < steps ? val : target);
      if (i >= steps) { clearInterval(interval); }
    }, 30);
  }

  // ── Web Audio Sound Generation ──────────────────────────────────────────────
  function getAudioContext() {
    if (!audioContext) {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
      } catch (e) {
        return null;
      }
    }
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    return audioContext;
  }

  function stopSounds() {
    activeOscillators.forEach((node) => {
      try { node.stop(); } catch (_) {}
    });
    activeOscillators = [];
  }

  /**
   * Play a synthesized ambient tone based on stage.
   * Stage 1–2: calm sine tones (low frequency)
   * Stage 3–5: tension (sawtooth, slight dissonance)
   * Stage 6–9: eerie distorted (square + noise, tremolo)
   */
  function playStageSound(stage) {
    const ctx = getAudioContext();
    if (!ctx) { return; }
    stopSounds();

    // Always fade in nicely
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0, ctx.currentTime);
    masterGain.gain.linearRampToValueAtTime(0.06, ctx.currentTime + 0.5);
    // Fade out after 4 seconds
    masterGain.gain.linearRampToValueAtTime(0.04, ctx.currentTime + 3.5);
    masterGain.gain.linearRampToValueAtTime(0, ctx.currentTime + 5);
    masterGain.connect(ctx.destination);

    if (stage <= 2) {
      // Calm: two soft sine tones (major third harmony)
      playTone(ctx, masterGain, 220, 'sine', 5);
      playTone(ctx, masterGain, 277.18, 'sine', 5);

    } else if (stage <= 5) {
      // Tension: sawtooth with slight detune
      playTone(ctx, masterGain, 110, 'sawtooth', 5, 5);
      playTone(ctx, masterGain, 113.5, 'sawtooth', 5, -5);
      // Add subtle tremolo
      addTremolo(ctx, masterGain, 4, 0.3);

    } else {
      // Eerie: square wave chord + noise burst
      playTone(ctx, masterGain, 82.41, 'square', 5, 0);
      playTone(ctx, masterGain, 87,    'square', 5, 0);
      // Noise layer
      playNoise(ctx, masterGain, 0.015, 4);
      // Aggressive tremolo
      addTremolo(ctx, masterGain, 8 + (stage - 6) * 2, 0.7);
    }

    activeOscillators.push(masterGain);
  }

  function playTone(ctx, destination, freq, type, duration, detune = 0) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = detune;
    gain.gain.value = 1;
    osc.connect(gain);
    gain.connect(destination);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
    activeOscillators.push(osc);
  }

  function playNoise(ctx, destination, amplitude, duration) {
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = (Math.random() * 2 - 1) * amplitude;
    }
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(destination);
    source.start(ctx.currentTime);
    activeOscillators.push(source);
  }

  function addTremolo(ctx, destination, rate, depth) {
    const lfo = ctx.createOscillator();
    const lfoGain = ctx.createGain();
    lfo.frequency.value = rate;
    lfoGain.gain.value = depth;
    lfo.connect(lfoGain);
    lfoGain.connect(destination.gain);
    lfo.start(ctx.currentTime);
    lfo.stop(ctx.currentTime + 5);
    activeOscillators.push(lfo);
  }

  // ── Signal readiness to extension host ─────────────────────────────────────
  vscode.postMessage({ type: 'ready' });
})();
