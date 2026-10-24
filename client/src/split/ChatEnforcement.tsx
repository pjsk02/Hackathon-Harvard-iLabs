import type { Conversation } from "@shared/workspace";
import type { Receipt } from "@shared/contract";
import { chatEnforcement } from "./chat-enforcement";

export function ChatEnforcement({ message, conversations, receipts, disabled, onView }: {
  message: Conversation; conversations: Conversation[]; receipts: Receipt[];
  disabled: boolean; onView: (request: Conversation) => void;
}) {
  const status = chatEnforcement(message, conversations, receipts);
  return <div className={`chat-enforcement ${status.state}`} data-enforcement={status.state}>
    <span role="status">{status.text}</span>
    <button type="button" disabled={disabled} onClick={() => onView(status.run)}>{status.action}</button>
  </div>;
}
