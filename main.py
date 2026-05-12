import discord
from discord import app_commands
from discord.ext import commands
import yt_dlp
import asyncio
import os
from flask import Flask
from threading import Thread

# --- Flask Keep-alive ---
app = Flask('')
@app.route('/')
def home(): return "Bot is Online!"

def run():
    app.run(host='0.0.0.0', port=int(os.environ.get("PORT", 8080)))

Thread(target=run).start()

# --- Bot Setup ---
TOKEN = os.getenv('DISCORD_TOKEN')
intents = discord.Intents.default()
intents.message_content = True

class MyBot(commands.Bot):
    async def setup_hook(self):
        await self.tree.sync()

bot = MyBot(command_prefix="!", intents=intents)

# --- yt-dlp設定（Cookieファイル指定） ---
YTDL_OPTIONS = {
    'format': 'bestaudio/best',
    'noplaylist': True,
    'cookiefile': 'cookies.txt',  # GitHubに上げたcookies.txt（Netscape形式）を使用
    'source_address': '0.0.0.0',
}

FFMPEG_OPTIONS = {
    'before_options': '-reconnect 1 -reconnect_streamed 1 -reconnect_delay_max 5',
    'options': '-vn',
}

ytdl = yt_dlp.YoutubeDL(YTDL_OPTIONS)

@bot.tree.command(name="sound", description="YouTube再生")
async def sound(interaction: discord.Interaction, url: str):
    await interaction.response.defer()
    clean_url = url.split('&')[0]

    if not interaction.user.voice:
        return await interaction.followup.send("VCに入ってください")

    vc = interaction.guild.voice_client or await interaction.user.voice.channel.connect()
    
    try:
        loop = asyncio.get_event_loop()
        # Cookieを使用して抽出
        data = await loop.run_in_executor(None, lambda: ytdl.extract_info(clean_url, download=False))
        vc.play(discord.FFmpegPCMAudio(data['url'], **FFMPEG_OPTIONS))
        await interaction.followup.send(f"再生中: {data.get('title')}")
    except Exception as e:
        await interaction.followup.send(f"エラー: YouTubeにブロックされました。Cookieを更新してください。")

bot.run(TOKEN)