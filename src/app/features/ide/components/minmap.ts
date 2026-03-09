import { basicSetup, EditorView } from 'codemirror';
import { showMinimap } from "@replit/codemirror-minimap"

let create = (v: EditorView) => {
    const dom = document.createElement('div');
    return { dom }
}


export const miniMap = () => [

    showMinimap.compute(['doc'], (state) => {
        return {
            create,
            /* optional */
            displayText: 'blocks',
            showOverlay: 'always',
            gutters: [{ 1: '#00FF00', 2: '#00FF00' }],
        }
    }),

]