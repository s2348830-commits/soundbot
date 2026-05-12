const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');
const express = require('express');
const fs = require('fs');
const app = express();

// --- 1. Render Keep-alive ---
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Bot is Online!'));
app.listen(PORT, () => console.log(`Server: ${PORT}`));

// --- 2. Cookieの読み込み設定 ---
// リポジトリにアップした cookies.json を読み込みます
if (fs.existsSync('./cookies.json')) {
    play.setToken({
        youtube: {
            cookie: JSON.parse(fs.readFileSync('./cookies.json', 'utf8'))
        }
    });
    console.log('Cookie loaded successfully.');
} else {
    console.warn('Warning: cookies.json not found. Data center blocking may occur.');
}

// --- 3. Discord Bot 設定 ---
const TOKEN = process.env.DISCORD_TOKEN;
const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages],
});

const commands = [{
    name: 'sound',
    description: 'YouTubeを再生',
    options: [{ name: 'url', type: 3, description: 'YouTubeのURL', required: true }]
}];

client.once('ready', async () => {
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log(`${client.user.tag} Ready!`);
});

client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'sound') {
        const rawUrl = interaction.options.getString('url');
        const url = rawUrl.split('&')[0]; // パラメータ削除
        
        if (!interaction.member.voice.channel) return interaction.reply('VCに入ってください');

        await interaction.deferReply();

        try {
            // Cookieを使用して情報を取得
            const stream = await play.stream(url, { quality: 2 });
            const resource = createAudioResource(stream.stream, { inputType: stream.type });
            const player = createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Play } });

            const connection = joinVoiceChannel({
                channelId: interaction.member.voice.channel.id,
                guildId: interaction.guild.id,
                adapterCreator: interaction.guild.voiceAdapterCreator,
            });

            player.play(resource);
            connection.subscribe(player);

            await interaction.editReply(`再生中 🎶: ${url}`);
        } catch (error) {
            console.error(error);
            await interaction.editReply('再生エラー。Cookieが期限切れか、YouTubeの規制が強化されています。');
        }
    }
});

client.login(TOKEN);