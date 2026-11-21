import type { PinProfilePin } from "../../../types/project.ts";

export interface SubmissionProfile {
  identity: { value: string; package: string };
  pinCount: number;
  pins: PinProfilePin[];
}

export interface ProfileSubmission {
  kind: "protoroute.pin-profile";
  schemaVersion: 1;
  appVersion: string;
  submissionId: string;
  contentHash: string;
  createdAt: string;
  profile: SubmissionProfile;
}
