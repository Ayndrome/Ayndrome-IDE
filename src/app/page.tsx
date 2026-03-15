"use client";
import { ProjectViewContainer } from "./features/projects/components/ProjectViewContainer";


export default function Home() {



  return (
    <ProjectViewContainer />
  );
}


// {
//     "fileName": "TabManger.tsx",
//     "code": "\"use client\";\nimport { ProjectViewContainer } from \"./features/projects/components/ProjectViewContainer\";\n\n\nexport default function Home() {\n\n\n\n  return (\n    div\n    <ProjectViewContainer />\n  );\n}\n",
//     "cursor": 162,
//     "currentLine": "    div",
//     "previousLines": "\"use client\";\nimport { ProjectViewContainer } from \"./features/projects/components/ProjectViewContainer\";\n\n\nexport default function Home() {\n\n\n\n  return (\n    div",
//     "textBeforeCursor": "    div",
//     "textAfterCursor": "",
//     "nextLines": "\n    <ProjectViewContainer />\n  );\n}\n",
//     "lineNumber": 10
// } why its only suggesting '>' one augular brakcet and not full line of div. I need multiline suggestion how others IDE does. 

// i never said change the text color from grey to green but after accepting highlight the background color of that accepted text in green until move didn't change the cursor position and if the suggestion is multiline suggestion then suggest in diff box which is light green rectangular box