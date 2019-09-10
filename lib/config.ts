import fs from 'fs';

import logger from './logger';

export class Config {
  static DEFAULT_CONFIG: string;
  ready: boolean;
  path: string;
  private _v: IConfig;

  constructor (path: string) {
    this.path = path;
    this._v = JSON.parse(Config.DEFAULT_CONFIG);
    this.ready = false;
  }

  async init(): Promise<Config> {
    try {
      this._v = JSON.parse(await fs.promises.readFile(this.path, 'utf-8'));
      this.ready = true;
      return this;
    } catch (err) {
      if (err.code === 'ENOENT') {
        logger.debug('Config not found. Create one...');
        await this._createConfig();
        logger.info('Config created. Edit "config.json" and restart service');
        process.exit(0);
      }
      throw err;
    }
  }

  get(key: keyof IConfig): any {
    if (!this.ready) throw new Error('Config must initialize before use.');
    return this._v[key];
  }

  async _createConfig() {
    return await fs.promises.writeFile(this.path, Config.DEFAULT_CONFIG, 'utf-8');
  }
}
Config.DEFAULT_CONFIG = `{
  "osDetect": "auto",
  "serverPath": "../mcb",
  "telegramBotToken": "[YOUR_TELEGRAM_BOT_TOKEN]",
  "telegramBotChatroomId": "[YOUR_TELEGRAM_CHATROOM_ID (Send this bot a command from the corresponding chat room: /getChatroomId@[BOTNAME])]",
  "telegramChatToServer": false,
  "serverStartMessage": "Minecraft server started!",
  "joinMessage": "{0} join server.",
  "leaveMessage": "{0} leave server.",
  "telegramChatFormat": "<{0}> {1}"
}`;

export interface IConfig {
  osDetect: string;
  serverPath: string;
  telegramBotToken: string;
  telegramBotChatroomId: string;
  telegramChatToServer: boolean;
  serverStartMessage: string;
  joinMessage: string;
  leaveMessage: string;
  telegramChatFormat: string;
}

export const instance = new Config('./config.json');
