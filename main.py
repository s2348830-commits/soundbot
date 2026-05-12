import discord
from discord import app_commands
from discord.ext import commands
import yt_dlp
import asyncio
import os
from flask import Flask
from threading import Thread

# --- 1. Render Keep-alive 用の Flask サーバー設定 ---
app = Flask('')

@app.route('/')
def home():
    return "Bot is running!"

def run():
    # Renderのポート番号を取得（デフォルトは8080）
    port = int(os.environ.get("PORT", 8080))
    app.run(host='0.0.0.0', port=port)

def keep_alive():
    t = Thread(target=run)
    t.start()

# --- 2. Discord Bot の設定 ---
# Renderの環境変数からトークンを取得します
TOKEN = os.getenv('DISCORD_TOKEN')

intents = discord.Intents.default()
intents.message_content = True # メッセージ内容は基本不要ですが、念のため有効化

class MyBot(commands.Bot):
    def __init__(self):
        # プレフィックスコマンドも一応設定（!playなど）
        super().__init__(command_prefix="!", intents=intents)

    async def setup_hook(self):
        # スラッシュコマンドの同期
        await self.tree.sync()
        print(f"Synced slash commands for {self.user}")

bot = MyBot()

# yt-dlp のオプション設定
YTDL_OPTIONS = {
    'format': 'bestaudio/best',
    'extractaudio': True,
    'audioformat': 'mp3',
    'outtmpl': '%(extractor)s-%(id)s-%(title)s.%(ext)s',
    'restrictfilenames': True,
    'noplaylist': True,
    'nocheckcertificate': True,
    'ignoreerrors': False,
    'logtostderr': False,
    'quiet': True,
    'no_warnings': True,
    'default_search': 'auto',
    'source_address': '0.0.0.0',
}

FFMPEG_OPTIONS = {
    'before_options': '-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5',
    'options': '-vn',
}

ytdl = yt_dlp.YoutubeDL(YTDL_OPTIONS)

class YTDLSource(discord.PCMVolumeTransformer):
    def __init__(self, source, *, data, volume=0.5):
        super().__init__(source, volume)
        self.data = data
        self.title = data.get('title')
        self.url = data.get('url')

    @classmethod
    async def from_url(cls, url, *, loop=None, stream=True):
        loop = loop or asyncio.get_event_loop()
        # YouTube情報の抽出
        data = await loop.run_in_executor(None, lambda: ytdl.extract_info(url, download=not stream))
        
        if 'entries' in data:
            data = data['entries'][0]

        filename = data['url'] if stream else ytdl.prepare_filename(data)
        return cls(discord.FFmpegPCMAudio(filename, **FFMPEG_OPTIONS), data=data)

# --- 3. スラッシュコマンド (/sound) ---
@bot.tree.command(name="sound", description="YouTubeのURLから曲を再生します")
@app_commands.describe(url="再生したいYouTubeのURL")
async def sound(interaction: discord.Interaction, url: str):
    # 応答を保留（YouTubeの処理に時間がかかるため）
    await interaction.response.defer()

    # ユーザーがボイスチャンネルにいるか確認
    if not interaction.user.voice:
        return await interaction.followup.send("先にボイスチャンネルに参加してください。")

    channel = interaction.user.voice.channel

    # ボットが既にどこかのチャンネルに接続しているか確認
    vc = interaction.guild.voice_client

    if vc:
        if vc.channel.id != channel.id:
            await vc.move_to(channel)
    else:
        vc = await channel.connect()

    try:
        # 音源の取得
        async with interaction.channel.typing():
            player = await YTDLSource.from_url(url, loop=bot.loop, stream=True)
            
            # 再生中の場合は停止
            if vc.is_playing():
                vc.stop()
            
            vc.play(player, after=lambda e: print(f'Player error: {e}') if e else None)
            
        await interaction.followup.send(f'再生を開始します: **{player.title}**')
    except Exception as e:
        await interaction.followup.send(f"エラーが発生しました: {e}")

@bot.event
async def on_ready():
    print(f'Logged in as {bot.user} (ID: {bot.user.id})')
    print('------')

# --- 4. 実行 ---
if __name__ == "__main__":
    if not TOKEN:
        print("エラー: 環境変数 'DISCORD_TOKEN' が設定されていません。")
    else:
        # Flaskを別スレッドで起動
        keep_alive()
        # ボットを起動
        bot.run(TOKEN)