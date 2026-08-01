import { hashId } from "../util/crypto.ts";

export function commandApprovalId(sessionId: string, command: string): string {
  return hashId([sessionId, command]);
}
