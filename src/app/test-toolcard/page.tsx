
'use-client'

import { ToolCardTerminal } from "../features/ide/extensions/chat/ToolCardTerminal";
import { ToolCard } from "../features/ide/extensions/chat/ToolCard";


export default function TestToolCard() {
    // return <ToolCardTerminal sessionName="saf" output="good" isRunning={true} />
    return <ToolCard toolName="read_file" toolState="running" rawParams={{ "path": "/home" }} />
}