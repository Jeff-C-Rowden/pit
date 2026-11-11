export const WELCOME_CHIPS_CENTS = 10000; // $100 sandbox test chips, an allowed Cage amount
export const ONBOARD_KEY = "pit_onboarded_v1";

export type TourStep = { title: string; body: string };

export const TOUR_STEPS: TourStep[] = [
  { title: "Welcome to Pit", body: "A 21+ sandbox casino. Every chip here is a test credit with no cash value. Claim a one-time $100 welcome in sandbox chips to start. The Cage also gives $25 in free sandbox chips once a day." },
  { title: "Pick a table", body: "Each card on the floor is a game. Tap one to take a seat. Odds and RTP are published on House rules." },
  { title: "The Cage", body: "Your balance sits at the top. Add more sandbox chips or set play limits in the Cage any time." },
  { title: "Play within limits", body: "Set session and loss limits in the Cage. Take breaks. Outcomes are random and the house has an edge." },
];

export function welcomeKey(userId: string) {
  return `welcome-${userId}`;
}

export function nextStep(i: number) {
  return Math.min(i + 1, TOUR_STEPS.length - 1);
}
export function prevStep(i: number) {
  return Math.max(i - 1, 0);
}
export function isLast(i: number) {
  return i >= TOUR_STEPS.length - 1;
}
