const { spawn } = require('node:child_process')

const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const isWindows = process.platform === 'win32'
const child = spawn('electron-vite', ['dev'], { stdio: 'inherit', env, shell: isWindows })

child.on('exit', (code) => process.exit(code ?? 0))
child.on('error', (err) => {
  console.error(err)
  process.exit(1)
})
