1. Diff UI is not working as expected. The accept reject ticks are showing between number gutter line and editor at cm-diff-gutter. It must on the top of each file diff. Also, the green and red highlighings in the diff editor is showing properly. Suppose LLM had added 10 lines and deleted 5 lines, then it should show 10 green lines and 5 red lines. But its showing let say 2-5 green lines and sometimes no red lines(mostly no red lines). Something is stoping must be a conflict between editor or some UI css problem.
2. File Tree crud operations are not working as expected.
3. Accept and Reject buttons per file is not there.
4. In chat panel if llm edited some files, then we should show the diff of the file in the chat panel itself. When LLM has not changed into the editor directly, but it showed the diff in the chat panel for what should be done. (For small edits, it is fine to show in chat panel, but for large edits, it should be shown in the editor itself, with accept and reject buttons per file)
5. Permission error when llm tries to run terminal commands. (OCI Error OCI runtime exec failed: exec failed: unable to start container process: chdir to cwd ("/workspace/movie-app") set in config.json failed: not a directory: Are you trying to mount a directory onto a file (or vice-versa)? Check if the specified host path exists and is the expected type
Exit 127 > npx
> create-next-app movie-app @/*


Aborting installation.
Unexpected error. Please report it as a bug:
 Error: EACCES: permission denied, mkdir '/home/devuser/.config/create-next-app-nodejs'
    at Object.mkdirSync (node:fs:1386:26)
    at Conf._ensureDirectory (/tmp/npm-cache/_npx/c9800bfd9fb83349/node_modules/create-next-app/dist/index.js:74:104622)
    at get store [as store] (/tmp/npm-cache/_npx/c9800bfd9fb83349/node_modules/create-next-app/dist/index.js:74:103351)
    at new Conf (/tmp/npm-cache/_npx/c9800bfd9fb83349/node_modules/create-next-app/dist/index.js:74:101157)
    at run (/tmp/npm-cache/_npx/c9800bfd9fb83349/node_modules/create-next-app/dist/index.js:74:218959)
    at /tmp/npm-cache/_npx/c9800bfd9fb83349/node_modules/create-next-app/dist/index.js:74:229391
    at /tmp/npm-cache/_npx/c9800bfd9fb83349/node_modules/create-next-app/dist/index.js:74:229429
    at Object.<anonymous> (/tmp/npm-cache/_npx/c9800bfd9fb83349/node_modules/create-next-app/dist/index.js:74:229450)
    at Module._compile (node:internal/modules/cjs/loader:1521:14)
    at Module._extensions..js (node:internal/modules/cjs/loader:1623:10) {
  errno: -13,
  code: 'EACCES',
  syscall: 'mkdir',
  path: '/home/devuser/.config/create-next-app-nodejs'
})

6. Sync between opening a file and editor is slow. It must be instant.
7. Whole Chat panel UI and toolcard must be revamped.
8. No scroll in file manager. If any file is deleted from tree panel, it should be highlighted in the tabs too with strikethrough.
9. Zoom in and Zoom out is not integrated with the editor.
10. No selection quick edits in the editor.(When user selects some text in the editor, it should show a quick edit menu)
11. Big Problem - LLM Cost is too high. We need to optimize it. Create a Movie App Find the movies according to your preferences by searching for its name. This simple prompt hitted 18 api request and consumed 140k input tokens for 2.5 gemini flash model.
12. Editor height is growing anomously and hiding the upper file tabs.
13. In Chat Panel, there is not direct navigation to the file or line number when clicked on the file name or line number in the chat panel.
14. In chat panel, what files llm has edited all those files must be highlighed in changes overview component with accept and reject buttons per file. Plus, how many lines are added and deleted in each file must be shown in the changes overview component.
15. No Artifacts UI is there. We need to add it.
16. Markdown Tables UI is pending.
17. Questioning from LLM if confidence is low or need clarification. This feature is pending.
18. Import from github backend is pending.
19. Context Window management and optimization is required. Some algorithm to decide which files to include in the context window is required. 
20. If the seesion is long, then the context window will be filled with the previous messages. We need to summarize the previous messages to reduce the context window size. Compaction of messages is required.
21. If the file is large LLM must not read the whole file. It should only read the relevant parts of the file. Or read in chunks. 
22. Indexing of codebase if required. So that LLM can quickly find the relevant parts of the file. If the codebase is large, then it will be difficult to find the relevant parts of the file. We need to index the codebase in efficient way, either index some part of the codebase. Also, we need a watcher to index the updated content of the files.
24. If LLM has created a new file then that must be opened in the editor. And if LLM has deleted a file then that must be closed in the editor.
25. http://localhost:3000/api/files?workspaceId=jx7989cer1nnx2e7c1z26d9nn9849bh5&path=movie-app%2Fpackage.json&type=file
Request Method
GET
Status Code
404 Not Found {error: "File not found"}
error
: 
"File not found"
26.  Chain of thought is missing. LLM is not checking if its previous work was correct and successfully executed or not. It should check and then proceed to the next step. Or LLM should try different path. (Right now its repeatedly doing the same thing and not learning from its mistakes. It should try different path if the previous path was not successful. )
27. LLM is not able to understand the context of the project. It should be able to understand the context of the project and then proceed to the next step. 
28. LLM is not showing the thought process.
29. LLM is not convering with the user like what its doing now and what it does right now and what it will do next. LLM must provide a summary of what it has done and what it will do next at each steps. 
30. LLM does not have any context of the project. When user ask to change something in the project or create this feature or app, LLM should first understand the context of the project and then proceed to the next step. Which language to use, which framework to use, which libraries to use, etc. Right now, its just blindly following the instructions and not understanding the context of the project. I asked to create a movie app, it created a movie app file name without any language extension just a simle file with no extension. and blindly tries to write the code. Neither checked the existing files nor understood the context of the project. 
31. Phase 10.5 is purely missing. 
32. Heavy context engineering is required. 
33. No multiple editor instances are allowed. 
34. Optimization techniques are required for file tree and chat panel if the workspace is large. So it smootly renders and works as expected. 