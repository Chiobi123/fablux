@echo off
cd "%~dp0"
set NODE_ENV=development
echo Starting FabluX Server with NODE_ENV=development...
node server.js
pause