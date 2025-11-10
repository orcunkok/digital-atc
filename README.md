<div align="center">
  <h1>Digital ATC</h1>
  <img src="public/logo.svg" alt="Digital ATC Logo" width="120" height="120">

  <h4>Flight simulation for AI development</h4>
  <p>Build LLMs and algorithms without fighting with overly complex simulators</p>
</div>

---

![Digital ATC Application](docs/screenshot.png)

## What This Is

**Digital ATC** is an open-source flight simulation platform built specifically for developing AI systems, algorithms, and LLMs. Think of it as the Goldilocks zone: realistic enough to be useful, simple enough to iterate fast.

### The Problem We're Solving

Here's the thing: existing flight simulators are **way too realistic** for what most of us actually need. When you're building:
- LLMs that understand ATC instructions
- Coordination algorithms for multi-aircraft scenarios  
- Navigation systems for autonomous flight
- Decision-making algorithms for conflict resolution

...you don't need perfect aerodynamics. You need:
- **Fast iteration** - test ideas in minutes, not hours
- **Simple setup** - runs in a browser, no WSL, no Linux headaches, no RAM-hungry installations
- **Configurable parameters** - set max speed, vertical speed limits, turn rates without diving into physics textbooks
- **Realistic enough** - good enough for your use case, **simple enough** to actually use

Realism is for control algorithms. **We're building for AI and decision-making.**

### What We Built

A lightweight, web-based flight simulator that gets out of your way:

- **🎯 LLM-Powered Digital Pilots** *(Our main focus)* - Parse ATC instructions, generate proper readbacks with ICAO/NATO phonetics, execute commands intelligently
- **🧠 AI Algorithm Development** - Perfect for training coordination, navigation, and decision-making systems without physics getting in the way
- **⚡ Simplified 3D Simulation** - Point-mass physics over real Mapbox terrain (San Francisco Bay Area)
- **🔧 Configurable Flight Envelopes** - Set max speed, vertical speed limits, turn rates with simple parameters
- **📋 Scenario-Based Training** - Pre-built scenarios for rapid testing
- **🌐 Zero-Install Development** - Browser-based, works everywhere, no heavy dependencies

## Use Cases

**Primary: LLM Development**
- Train language models to understand ATC instructions
- Generate proper aviation readbacks with phonetics
- Build conversational AI for air traffic control

**AI & Algorithm Development**
- Coordination algorithms for multi-aircraft scenarios
- Navigation algorithms for autonomous flight planning
- Decision-making systems for conflict resolution
- ATC system training and testing

**Rapid Prototyping**
- Test ideas quickly without complex simulator setup
- Iterate on algorithms with configurable flight parameters
- Validate concepts before moving to full-fidelity simulators

## Quick Start

```bash
# Install dependencies
npm install

# Copy the sample environment file and fill in tokens
cp .env.example .env

# Run it
npm run dev
```

That's it. No Docker, no WSL, no 50GB downloads. Just works.

## Features

✅ **LLM Integration Ready** - Structured I/O schemas and prompt templates for digital pilot development  
✅ **Configurable Flight Envelopes** - Set aircraft parameters programmatically  
✅ **3D Terrain Visualization** - Mapbox terrain with real-time aircraft tracking  
✅ **Point-Mass Physics** - Simplified dynamics perfect for high-level algorithm work  
✅ **Manual & Automated Controls** - Direct control or target-based automation  
✅ **Scenario Playback** - Pre-built scenarios for testing  

## Tech Stack

- **Frontend**: Vue 3 + Vite (runs in browser, zero installation)
- **3D Rendering**: Mapbox GL JS + Three.js
- **Physics**: Custom point-mass engine (configurable, not over-engineered)
- **AI Ready**: JSON schemas, prompt templates, lexicon for LLM integration

## Environment & LLM Setup

- `VITE_MAPBOX_TOKEN` is required for terrain rendering. Sign up at [Mapbox](https://account.mapbox.com/) for a free developer token.
- `VITE_OPENAI_API_KEY` enables the digital pilot. Copy your key from the [OpenAI dashboard](https://platform.openai.com/) and paste it into `.env`.
- `VITE_OPENAI_MODEL` defaults to `gpt-4o-mini`, a fast/affordable model (~$0.15 per 1M input tokens, ~$0.60 per 1M output tokens). The YC demo flow stays under a few cents per recording.
- If either token is missing the app will warn you on startup; Mapbox terrain and LLM automation fall back gracefully.

## YC Demo Scenario

- Choose **"YC Demo"** in the Scenario selector to run a scripted KOAK shoreline flight used in the YC walkthrough.
- The timeline injects a realistic mix of ATC calls: climb & heading assignments, TFR avoidance, speed reduction for traffic, and a handoff.
- Every ATC transmission is piped through the digital pilot (`src/llm/pilotAgent.js`); watch the Transcript tab for live readbacks and the State tab for updated intent/safety flags.
- Scenario data lives in `scenarios/YC_KOAK_demo.json` and is executed by the runner in `src/sim/scenarioRunner.js`—tweak or extend events without touching UI wiring.

## Current Status

**What's Working:**
- Core flight simulation with manual controls and automated target following
- LLM-ready architecture with schemas and prompts
- Real-time 3D visualization over Mapbox terrain
- Configurable flight parameters

**What's Next:**
- LLM integration for ATC parsing and readback generation
- Conflict detection and safety flagging
- Enhanced scenario system

---

<div align="center">
  <img src="docs/dsb_robotics.png" alt="dsb robotics" height="40">
  <p><small>MIT License</small></p>
</div>
