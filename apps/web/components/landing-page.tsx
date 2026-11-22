"use client"

import { CheckCircle, Shield, Lock, Github, Download, Play } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex-1 overflow-auto bg-gradient-to-b from-background to-muted/20">
      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="flex items-center gap-6 mb-12">
          <div className="flex-1">
            <h1 className="text-4xl font-bold mb-4">Indoor orienteering route analysis</h1>
            <p className="text-lg text-muted-foreground">
              An experimental tool for analyzing and optimizing indoor orienteering courses. Note that this is currently
              a proof-of-concept and the application may be unstable.
            </p>
          </div>
          <div className="w-1/6 flex-shrink-0">
            <img src="/icon.png" alt="App Icon" className="w-full h-auto ml-auto" />
          </div>
        </div>

        {/* Principles Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Core principles</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* No Tracking */}
            <div className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <Shield className="h-6 w-6 text-primary" />
                <h3 className="font-semibold">No tracking</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                Your activities are never monitored or shared. There are no cookies and no cookie consent dialog. You can run this application completely offline.
              </p>
            </div>

            {/* Privacy and Security */}
            <div className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <Lock className="h-6 w-6 text-primary" />
                <h3 className="font-semibold">Privacy and security</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                No account required. It is a &ldquo;browser-first&rdquo; app, all data is stored locally on your device. Your data stays private. You are in full
                control.
              </p>
            </div>

            {/* Transparency */}
            <div className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <Github className="h-6 w-6 text-primary" />
                <h3 className="font-semibold">Transparency</h3>
              </div>
              <p className="text-sm text-muted-foreground">
                The code is open source and publicly available for review and verification.
              </p>
            </div>
          </div>
        </div>

        {/* How to Use Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">How to use</h2>
          <div className="space-y-4">
            {/* Step 1 */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex gap-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold flex-shrink-0">
                  1
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold">Create or import event</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Start by creating or importing an event. An event contains all the necessary data including maps and
                    courses. You can import existing events in IOF XML 3.0 format or create a new event from scratch.
                    Note that you may need to upload or reload your map file (PDF), as this is not part of the event
                    file.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex gap-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold flex-shrink-0">
                  2
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold">Draw graph</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Use the Graph view to create a visual representation of your route. This is the most laborious
                    part of preparing the analysis. Add nodes, edges, and connections between control points. Define
                    one-way passages, stairs, and connections between different map parts or floors.
                  </p>
                </div>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-card border border-border rounded-lg p-6">
              <div className="flex gap-4">
                <div className="flex items-center justify-center w-8 h-8 rounded-full bg-primary text-primary-foreground font-semibold flex-shrink-0">
                  3
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-semibold">Analyse routes</h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    View detailed analysis of your routes including distances, estimated time and difficulty metrics.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Instruction Videos Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Instruction videos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <a
              href="https://www.youtube.com/watch?v=MxXTMJnUXaM"
              target="_blank"
              rel="noopener noreferrer"
              className="group bg-card border border-border rounded-lg overflow-hidden hover:border-primary/50 transition-colors"
            >
              <div className="relative">
                <img
                  src="https://img.youtube.com/vi/MxXTMJnUXaM/maxresdefault.jpg"
                  alt="Route Analysis instruction video"
                  className="w-full h-auto"
                />
                <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/20 transition-colors">
                  <Play className="h-12 w-12 text-white drop-shadow-lg" />
                </div>
              </div>
              <div className="p-4">
                <h3 className="font-semibold mb-1">Route Analysis</h3>
                <p className="text-sm text-muted-foreground">
                  An introduction to the route analysis module.
                </p>
              </div>
            </a>
          </div>
        </div>

        {/* Features Highlight */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Key features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {[
              "Interactive map viewer with pan and zoom controls",
              "Visual graph editor for route planning",
              "Real-time distance and complexity calculations",
              "Course import (IOF XML 3.0)",
              "One-way passages",
              "Stairs and floor connections",
            ].map((feature) => (
              <div key={feature} className="flex items-start gap-3">
                <CheckCircle className="h-5 w-5 text-primary mt-0.5 flex-shrink-0" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Installation Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Install in browser</h2>
          <div className="bg-card border border-border rounded-lg p-6">
            <div className="flex items-start gap-4 mb-6">
              <Download className="h-6 w-6 text-primary flex-shrink-0 mt-1" />
              <div>
                <p className="text-muted-foreground">
                  This application is a Progressive Web App (PWA). You can install it on your device for offline access
                  and a native app-like experience. This is supported on most modern browsers (Chrome, Edge, Safari,
                  Firefox on Android).
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div>
                <h3 className="font-semibold mb-2">Desktop (Chrome / Edge)</h3>
                <p className="text-sm text-muted-foreground">
                  Look for the <span className="font-mono bg-muted px-1 rounded text-foreground">Install</span> icon in
                  the address bar (usually on the right side) to install the app on your computer.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">iOS / iPadOS (Safari)</h3>
                <p className="text-sm text-muted-foreground">
                  Tap the <span className="font-mono bg-muted px-1 rounded text-foreground">Share</span> button and
                  select <span className="font-mono bg-muted px-1 rounded text-foreground">Add to Home Screen</span>.
                </p>
              </div>

              <div>
                <h3 className="font-semibold mb-2">Android (Chrome)</h3>
                <p className="text-sm text-muted-foreground">
                  Tap the menu icon (three dots) and select{" "}
                  <span className="font-mono bg-muted px-1 rounded text-foreground">Install App</span> or{" "}
                  <span className="font-mono bg-muted px-1 rounded text-foreground">Add to Home Screen</span>.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Training App Section */}
        <div className="mb-12">
          <h2 className="text-2xl font-semibold mb-6">Related projects</h2>
          <div className="bg-card border border-border rounded-lg p-6 hover:border-primary/50 transition-colors">
            <div className="flex items-start gap-4">
              <div className="text-4xl">🏃</div>
              <div className="flex-1">
                <h3 className="font-semibold text-lg mb-2">Indoor-O training app</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Complement your route analysis with the training app, which can import courses and routes from this
                  application. Use it to practice on the routes you&apos;ve created and analyzed, with real-time tracking and
                  performance metrics.
                </p>
                <p className="text-sm text-primary hover:underline cursor-pointer">
                  <a href="https://github.com/objorke/indoor-o-training" target="_blank" rel="noopener noreferrer">
                    View on GitHub →
                  </a>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-8 border-t border-border text-sm text-muted-foreground">
          <div className="flex items-center justify-center gap-6 flex-wrap">
            <a
              href="https://github.com/objorke/indoor-o-route-analysis"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 hover:text-primary transition-colors"
            >
              <Github className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
