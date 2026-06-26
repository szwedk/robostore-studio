/**
 * Learn content — tutorials (interactive, step-by-step) and a structured
 * curriculum. Content is data so it can be localized or expanded without
 * touching the screen. `action.screen` lets a step send the learner into the app.
 */
import type { Screen } from "@/lib/store";

export interface TutorialStep {
  title: string;
  body: string;
  action?: { label: string; screen: Screen };
}
export interface Tutorial {
  id: string;
  title: string;
  blurb: string;
  minutes: number;
  steps: TutorialStep[];
}

export const TUTORIALS: Tutorial[] = [
  {
    id: "first-grasp",
    title: "Your first grasp",
    blurb: "Open and close the hand, and try your first pose.",
    minutes: 3,
    steps: [
      {
        title: "Open the Control screen",
        body: "Control is your cockpit — the live hand, poses, finger sliders, and tactile sensors all live here.",
        action: { label: "Go to Control", screen: "control" },
      },
      {
        title: "Try a pose",
        body: "Tap any pose tile — start with Fist, then Open. Watch the on-screen hand follow, and the fingertip dots glow when the sensors feel contact.",
      },
      {
        title: "Move a single finger",
        body: "Drag a slider under Finger Control. 0 is fully open, 1000 is fully closed. Notice how only that finger moves.",
      },
      {
        title: "Run the demo",
        body: "Hit Run demo to watch a short choreographed sequence. That’s the basics — you’re controlling a dexterous hand.",
      },
    ],
  },
  {
    id: "mirror-hand",
    title: "Mirror your own hand",
    blurb: "Use your camera to drive the device in real time.",
    minutes: 4,
    steps: [
      {
        title: "Open Camera",
        body: "The Camera screen tracks your hand with your webcam — everything stays on your device.",
        action: { label: "Go to Camera", screen: "camera" },
      },
      {
        title: "Start the camera",
        body: "Press Start camera and allow access. Hold your hand up, palm to the camera, until you see the blue skeleton lock on.",
      },
      {
        title: "Mirror to the hand",
        body: "Press Mirror to hand. Now open and close your fingers — the device copies you. Adjust Smoothing if it feels jittery or sluggish.",
      },
      {
        title: "Calibrate for a better fit",
        body: "Switch to Calibrate, capture your open hand then a fist. The mirror now maps your full range onto the device.",
      },
    ],
  },
  {
    id: "record-gesture",
    title: "Record & teach a gesture",
    blurb: "Capture a motion and train a custom gesture.",
    minutes: 5,
    steps: [
      {
        title: "Record a motion",
        body: "On Camera → Record, press Start recording, perform a motion (e.g. a wave), then Stop. It’s saved to your library.",
        action: { label: "Go to Camera", screen: "camera" },
      },
      {
        title: "Replay it",
        body: "Press the play icon on your recording — the device performs exactly what you captured. Export it as CSV if you want the data.",
      },
      {
        title: "Teach a gesture",
        body: "On Camera → Gestures, type a label like ‘grasp’, hold the shape, and press Capture a few times. Add a second label and capture that too.",
      },
      {
        title: "See it recognize",
        body: "Now switch between the shapes — the Live prediction updates with the best match and a confidence score.",
      },
    ],
  },
  {
    id: "read-sensors",
    title: "Read the touch sensors",
    blurb: "Understand force, contact, and proximity.",
    minutes: 3,
    steps: [
      {
        title: "Find the sensor strip",
        body: "On Control, the Tactile sensors row shows each fingertip’s normal force. The number is force; the dot lights on contact.",
        action: { label: "Go to Control", screen: "control" },
      },
      {
        title: "Make contact",
        body: "Close into a fist. The force values climb and the bars fill — green is light, amber is firm, red is high force.",
      },
      {
        title: "Watch the hand glow",
        body: "On the live hand, fingertips glow with the same color as their force band. That’s real-time tactile feedback.",
      },
    ],
  },
  {
    id: "first-script",
    title: "Write your first script",
    blurb: "Choreograph the hand with a few lines of code.",
    minutes: 6,
    steps: [
      {
        title: "Turn on Developer mode",
        body: "Flip the Developer mode switch at the bottom of the sidebar. A new Develop section appears.",
      },
      {
        title: "Open the code runner",
        body: "In Develop → Code, you get a small async API: pose(), move(), sleep(), and log().",
        action: { label: "Go to Develop", screen: "develop" },
      },
      {
        title: "Run a sequence",
        body: "Press Run on the sample script. It opens, makes a fist, waits, and points — all from code. Edit the values and run again.",
      },
    ],
  },
];

export interface Lesson {
  id: string;
  title: string;
  body: string;
}
export interface Module {
  id: string;
  title: string;
  summary: string;
  lessons: Lesson[];
}

export const CURRICULUM: Module[] = [
  {
    id: "foundations",
    title: "1 · Foundations",
    summary: "How a dexterous hand thinks about position and force.",
    lessons: [
      {
        id: "f-actuators",
        title: "Six actuators, one hand",
        body: "The Revo2 has six independently driven degrees of freedom: thumb flex, thumb rotation (opposition), and the four fingers. Every pose is just a vector of six numbers from 0 (open) to 1000 (closed). Thinking in this vector is the key mental model for everything else.",
      },
      {
        id: "f-normalized",
        title: "Normalized positions",
        body: "Positions are normalized so the same command works across hands and firmware. 0 means fully extended; 1000 means fully flexed. Intermediate values give you partial grips — essential for holding delicate objects without crushing them.",
      },
      {
        id: "f-opposition",
        title: "Why the thumb is special",
        body: "Human grasp depends on thumb opposition — rotating the thumb to face the fingers. That’s the thumb-rotate actuator. Pinch and OK poses combine thumb flex and rotation; practice reading how they differ.",
      },
    ],
  },
  {
    id: "sensing",
    title: "2 · Tactile sensing",
    summary: "Reading the world through fingertips.",
    lessons: [
      {
        id: "s-normal",
        title: "Normal vs. tangential force",
        body: "Normal force is the push straight into the fingertip; tangential force is the shear along its surface — the signal that an object is slipping. Together they let a hand grip ‘just firmly enough’ and react before something drops.",
      },
      {
        id: "s-proximity",
        title: "Proximity before contact",
        body: "Before touching, the sensor reports proximity — how close an object is. This pre-touch signal lets control loops slow down and land softly instead of slamming closed.",
      },
      {
        id: "s-bands",
        title: "Force bands and safety",
        body: "Studio colors force green / amber / red at set thresholds. In your own code, these bands become rules: stop closing at amber for fragile items, allow red for a power grip on a tool.",
      },
    ],
  },
  {
    id: "control",
    title: "3 · Control & autonomy",
    summary: "From teleoperation to gestures to code.",
    lessons: [
      {
        id: "c-teleop",
        title: "Teleoperation with the camera",
        body: "Camera mirroring is teleoperation: your hand is the master, the device the follower. Smoothing trades latency for stability. Calibration maps your range to the device so small motions aren’t lost and large ones don’t saturate.",
      },
      {
        id: "c-gestures",
        title: "Gesture recognition",
        body: "A k-NN classifier compares your current finger vector to labeled examples and votes on the nearest matches. More, cleaner samples per label means more reliable recognition. This is the bridge from manual control to intent-driven control.",
      },
      {
        id: "c-scripting",
        title: "Scripting and the API",
        body: "Anything you do by hand you can do in code through the local API. Sequencing poses with timed waits is the foundation of repeatable demos, tests, and eventually autonomous behaviors.",
      },
    ],
  },
];
