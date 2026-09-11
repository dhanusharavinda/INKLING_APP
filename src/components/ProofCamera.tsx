// Native stub: on Android/iOS proof snaps go through the system camera via
// expo-image-picker (see HabitsSection.handleSnap), so this component never
// renders. The browser build resolves ProofCamera.web.tsx instead, which is
// a real live-webcam capture (no file picker, so the gallery stays locked
// out on the web too).

export interface ProofCameraProps {
  onCapture: (dataUri: string) => void;
  onCancel: () => void;
}

export default function ProofCamera(_props: ProofCameraProps) {
  return null;
}
