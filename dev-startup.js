#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const path = require('path');
const os = require('os');
const process = require('process');

const projectRoot = process.cwd();
const isWindows = os.platform() === 'win32';
const isMac = os.platform() === 'darwin';
const isLinux = os.platform() === 'linux';

//Figure out what termnianl the linux user defends with their life
function getLinuxTerminal() {
  const terminals = [
    { cmd: 'st', args: (cmdStr) => ['-e', 'sh', '-c', cmdStr] },
    { cmd: 'gnome-terminal', args: (cmdStr) => ['--', 'bash', '-c', cmdStr] },
    { cmd: 'konsole', args: (cmdStr) => ['-e', 'bash', '-c', cmdStr] },
    { cmd: 'xfce4-terminal', args: (cmdStr) => ['-e', cmdStr] },
    { cmd: 'xterm', args: (cmdStr) => ['-e', 'bash', '-c', cmdStr] },
  ];
  
  for (const term of terminals) {
    try {
      const { execSync } = require('child_process');
      execSync(`which ${term.cmd}`, { stdio: 'ignore' });
      console.log(`✅ Found terminal: ${term.cmd}`);
      return term;
    } catch (e) {
      // Terminal not found, try next
    }
  }
  
  console.error('❌ No supported terminal found on Linux!');
  console.error('Please install one of: st, gnome-terminal, konsole, xfce4-terminal, or xterm');
  process.exit(1);
}

const linuxTerminal = isLinux ? getLinuxTerminal() : null;

// Processes to run
const processes = [
  {
    name: 'Server',
    cwd: path.join(projectRoot, 'Server'),
    command: 'node',
    args: ['index.js'],
  },
  {
    name: 'Client',
    cwd: path.join(projectRoot, 'client'),
    command: isWindows ? 'npm.cmd' : 'npm',
    args: ['run', 'dev'],
  },
  {
    name: 'Metro (React Native)',
    cwd: path.join(projectRoot, 'NodeMobile'),
    command: isWindows ? 'npx.cmd' : 'npx',
    args: ['react-native', 'start'],
  },
  {
    name: 'Android Build',
    cwd: path.join(projectRoot, 'NodeMobile'),
    command: isWindows ? 'npx.cmd' : 'npx',
    args: ['react-native', 'run-android'],
    keepOpen: true,
  },
];

const runningProcesses = [];

// Function to spawn a process in a new terminal
function spawnInTerminal(processInfo) {
  const { name, cwd, command, args } = processInfo;
  
  console.log(`\n[STARTUP] Launching "${name}"...`);
  
  if (isWindows) {
    // Windows: Use cmd /k to keep terminal open
    const cmdString = `cd /d "${cwd}" && ${command} ${args.join(' ')}`;
    exec(`start cmd.exe /k "${cmdString}"`, (error) => {
      if (error) console.error(`Error launching ${name}:`, error);
    });
  } else if (isMac) {
    // macOS: Use open -a Terminal
    const cmdString = `cd "${cwd}" && ${command} ${args.join(' ')}`;
    exec(`open -a Terminal "${cmdString}"`, (error) => {
      if (error) console.error(`Error launching ${name}:`, error);
    });
  } else if (isLinux) {
    const cmdString = `cd "${cwd}" && ${command} ${args.join(' ')}; exec bash`;
    const termArgs = linuxTerminal.args(cmdString);
    
      spawn(linuxTerminal.cmd, termArgs, {
      stdio: 'inherit',
      detached: true,
    });
  }
  
  runningProcesses.push({ name, cwd });
}

// Function to spawn process in current terminal (for debugging)
function spawnInline(processInfo) {
  const { name, cwd, command, args } = processInfo;
  
  console.log(`\n[STARTUP] Launching "${name}" inline...`);
  
  const proc = spawn(command, args, {
    cwd: cwd,
    stdio: 'inherit',
    shell: true,
  });
  
  proc.on('error', (error) => {
    console.error(`Error running ${name}:`, error);
  });
  
  proc.on('exit', (code) => {
    console.log(`\n[EXIT] "${name}" exited with code ${code}`);
  });
  
  return proc;
}

// Main startup sequence
async function startup() {
  console.log('========================================');
  console.log('  CS595 Capstone Dev Environment');
  console.log('========================================');
  console.log(`Platform: ${os.platform()}`);
  console.log(`Project Root: ${projectRoot}`);
  console.log('========================================\n');
  
  // Validate directories exist
  for (const proc of processes) {
    const exists = require('fs').existsSync(proc.cwd);
    if (!exists) {
      console.error(`❌ Directory not found: ${proc.cwd}`);
      process.exit(1);
    }
  }
  
  console.log('✅ All directories found\n');
  
  // Launch each process in a new terminal
  for (let i = 0; i < processes.length; i++) {
    spawnInTerminal(processes[i]);
    // Stagger launches by 2 seconds to avoid overwhelming the system
    if (i < processes.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n========================================');
  console.log('✅ All processes launched!');
  console.log('========================================');
  console.log('\nTo stop all processes, close the terminal windows.');
  console.log('\nRunning in background. Press Ctrl+C to exit this launcher.\n');
}

// Cleanup on exit
process.on('SIGINT', () => {
  console.log('\n\n========================================');
  console.log('  Shutting down...');
  console.log('========================================\n');
  
  runningProcesses.forEach(proc => {
    console.log(`Stopping: ${proc.name}`);
  });
  
  console.log('\nNote: Terminal windows were launched separately.');
  console.log('Close them manually or they will continue running.\n');
  
  process.exit(0);
});

// Start
startup().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
