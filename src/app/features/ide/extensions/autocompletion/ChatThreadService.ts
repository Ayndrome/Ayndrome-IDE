// ayndrome - web ide chat thread service

import { ChatMessage, ChatThread } from "../chat/types/types";

const CHAT_RETRIES = 3;
const RETRY_DELAY = 1000;

type UserMessageType = ChatMessage & { role: 'user' };
type UserMessageState = UserMessageType['state'];

const defaultMessageState: UserMessageState = {
    stagingSelections: [],
    isBeingEdited: false,
}


