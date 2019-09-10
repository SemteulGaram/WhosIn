import childProcess, { ChildProcessWithoutNullStreams } from 'child_process';
import os from 'os';
import path, { resolve } from 'path';

import Telegraf, { ContextMessageUpdate, Telegram } from 'telegraf';

import { instance as config } from './config';
import logger from './logger';

class WhosIn {
  // Internal mc server stdout buffer
  private _internalBuffer: string;
  // Import from config
  private _telegramBotChatroomId: number;
  private _telegramChatFormat: string;
  // Global bot telegraf instance
  private _botTelegraf: Telegraf<ContextMessageUpdate>;
  // Global bot telegram instance
  private _botTelegram: Telegram;
  // Official minecraft bedrock server alpha process
  private _server: ChildProcessWithoutNullStreams|null;
  

  constructor () {
    logger.info('WhosIn instance initialize...');

    this._internalBuffer = '';
    
    // Config initialize
    if (!config.ready) {
      throw new Error('Config not initialized!');
    }
    this._telegramBotChatroomId = parseInt(config.get('telegramBotChatroomId'));
    this._telegramChatFormat = config.get('telegramChatFormat');

    // Telegram bot initialize
    this._botTelegraf = new Telegraf(config.get('telegramBotToken'));
    this._botTelegraf.command('getChatroomId', (ctx: ContextMessageUpdate) => {
      if (ctx.chat) {
        ctx.reply('This chatroom id: ' + ctx.chat.id);
      } else {
        ctx.reply('Unknown id chatroom :/');
      }
    });
    // One-way chat sync (Telegram -> Server using /say command)
    if (config.get('telegramChatToServer')) {
      this._botTelegraf.on('text', (ctx: ContextMessageUpdate) => {
        if (!ctx.chat || !ctx.from) return;
        if (ctx.chat.id === this._telegramBotChatroomId) {
          // Build message
          const fullname = ctx.from.first_name + ctx.from.last_name ? ' ' + ctx.from.last_name : '';
          const message = ('' + ctx.message).replace('\n', ' ');
          this._sendMessage(this._telegramChatFormat.replace('{0}', fullname).replace('{1}', message));
        }
      });
    }
    this._botTelegraf.launch();
    this._botTelegram = this._botTelegraf.telegram;

    this._server = null;
  }

  // Official minecraft bedrock edition start
  startServer (): void {
    let cOs = config.get('osDetect');
    if (cOs === 'auto') {
      logger.debug('OS auto detecting...');
      cOs = os.platform() === 'win32' ? 'win32' : 'linux';
    }

    const serverPath = path.resolve(config.get('serverPath'));

    if (cOs === 'win32') {
      // OS logging
      logger.info('Platform: win32');

      // Path for server executable
      const serverExe = path.join(serverPath, 'bedrock_server.exe');
      logger.debug(`Server executable at: ${ serverExe }`);

      // Spawn server
      logger.info('Server spawning...');
      this._server = childProcess.spawn(serverExe, {
        cwd: serverPath
      });
      // TODO: test code
      //this._server = childProcess.spawn('node', [path.resolve('./test/test-server.js')], {
      //  cwd: path.resolve('.')
      //});
    } else {
      // OS logging
      cOs = 'linux';
      logger.info('Platfrom: linux');

      // Path for server executable
      const serverExe = path.join(serverPath, 'bedrock_server');
      logger.debug(`Server executable at: ${ serverExe }`);

      // Spawn server
      logger.info('Server spawning...');
      this._server = childProcess.spawn(serverExe, {
        cwd: serverPath,
        env: {
          'LD_LIBRARY_PATH': '.',
        }
      });
    }

    this._server.stdout.on('data', data => {
      process.stdout.write(data);
      this._internalBuffer += data.toString();
      this._bufferUpdate();
    });

    this._server.stderr.on('data', data => {
      process.stderr.write(data);
      logger.error(data.toString());
    });

    process.stdin.pipe(this._server.stdin);
    
    this._server.on('close', (code) => {
      logger[code === 0 ? 'info' : 'error'](`Server process exited with code ${code}`);
      process.exit(0);
    });
  }

  // Send chat to server
  private _sendMessage (text: string): void {
    if (!this._server) return;
    this._server.stdin.write('say ' + text + '\n');
  }

  // Server stdout update callback
  private _bufferUpdate (): void {
    if (!this._server) return;

    const lines: Array<string> = this._internalBuffer.split('\n');
    if (lines.length === 1) return;
    for (let i = 0; i < lines.length - 1; i++) {
      let target = null;
      if (lines[i].match(/^\[.* INFO\] Server started\.\r?$/)) {
        logger.info('Server start detect!');
        this._botTelegram.sendMessage(config.get('telegramBotChatroomId'),
          config.get('serverStartMessage'));
      } else if ((target = lines[i]
        .match(/^\[.* INFO\] Player connected: (.+), xuid: \d+\r?$/))) {

        this._botTelegram.sendMessage(config.get('telegramBotChatroomId'),
          config.get('joinMessage').replace('{0}', target[1]));
      } else if ((target = lines[i]
        .match(/^\[.* INFO\] Player disconnected: (.+), xuid: \d+\r?$/))) {

        this._botTelegram.sendMessage(config.get('telegramBotChatroomId'),
          config.get('leaveMessage').replace('{0}', target[1]));
      }
    }
    this._internalBuffer = lines[lines.length - 1];
    return;
  }
}

function main() {
  config.init().then(() => {
    const whosIn: WhosIn = new WhosIn();
    whosIn.startServer();
  }).catch(err => {
    logger.error(err);
    logger.error('UNEXPECTED CONFIG ERROR');
    process.exit(1);
  });
}

main();
