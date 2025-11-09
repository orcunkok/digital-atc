# Digital ATC

<div align="center">
  <img src="public/logo.svg" alt="Digital ATC Logo" width="120" height="120">
  
  <h3>Flight simulation for AI development</h3>
  <p>Build LLMs and algorithms without fighting with overly complex simulators</p>
</div>

---

![Digital ATC Application](public/screenshot.png)

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

# Set your Mapbox token
echo "VITE_MAPBOX_TOKEN=your_token_here" > .env

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
  <img src="public/dsb_robotics.png" alt="dsb robotics" height="40">
  <p><small>MIT License</small></p>
</div>
