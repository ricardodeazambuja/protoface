# ProtoFace 🎭

ProtoFace is a programmatic facial animation web application built with React and Vite. It allows users to generate expressive, phonetically-accurate facial animations from text input, featuring a dual-animation system that ranges from realistic speech to cartoonish, high-energy character performance.

## ✨ Features

- **🗣️ Dynamic Lip-Sync**: High-accuracy phoneme mapping with support for complex English sounds (`th`, `sh`, `ch`, etc.).
- **🔊 Text-to-Speech (TTS)**: Built-in offline TTS using [Piper](https://github.com/rhasspy/piper) with synced mouth animation.
- **📝 Script Tags**: Rich markup system for controlling animation:
  - `<joy>` / `<sad>` / `<angry>` - Emotion switching
  - `<pause:500>` - Insert pauses (milliseconds)
  - `<speed:0.5>` - Control speech speed (0.1x to 5x)
  - `<emphasis>text</emphasis>` - Add visual emphasis
- **🎭 Dual Animation Modes**: 
  - **Realistic**: Focuses on stable, accurate phonetic mouth movements.
  - **Cartoon**: Implements Pixar-style animation principles including **Anticipation**, **Overshoot**, and **Squash & Stretch**.
- **🎛️ Granular Control**: 0-100% Expressiveness slider to fine-tune character personality.
- **🎥 Animation Recording**: Export your animations as WebM videos directly from the browser.
- **🌈 Customization**: Full control over facial features (eye size, spacing, mouth width, teeth gap, skew, rotation) and backgrounds.
- **📱 Responsive Design**: Optimized layout for both desktop and mobile/vertical screens.
- **📲 Installable PWA**: Install as a native-like app on desktop and mobile with offline support.

## 🚀 Quick Start

### Prerequisites
- [Node.js](https://nodejs.org/) (v18 or higher)
- npm or yarn

### Installation
1. Clone the repository:
   ```bash
   git clone <your-repo-url>
   cd FaceProgrammaticAnimation
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open your browser and navigate to `http://localhost:5173`.

## 📦 Deployment

This project is configured for automated deployment to **GitHub Pages** via GitHub Actions. Every push to the `main` or `master` branch will trigger a build and deploy.

## 🙏 Acknowledgements

This project was inspired by the incredible educational work of **Amit Patel** at **Red Blob Games**. 
- [Original Face Generator Inspiration](https://www.redblobgames.com/x/1845-face-generator/)
- [Red Blob Games](https://www.redblobgames.com/)

---
© 2025 ProtoFace.
