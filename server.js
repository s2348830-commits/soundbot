const { Client, GatewayIntentBits, REST, Routes } = require('discord.js');
const { 
    joinVoiceChannel, 
    createAudioPlayer, 
    createAudioResource, 
    AudioPlayerStatus, 
    NoSubscriberBehavior 
} = require('@discordjs/voice');
const play = require('play-dl');
const express = require('express');
const app = express();

// --- 1. Render用 Webサーバー設定 (Keep-alive用) ---
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Bot is Online!'));
app.listen(PORT, () => console.log(`Listening on port ${PORT}`));

// --- 2. Discord Bot 設定 ---
const TOKEN = process.env.DISCORD_TOKEN;
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMessages,
    ],
});

// スラッシュコマンド定義
const commands = [
    {
        name: 'sound',
        description: 'YouTubeのURLから曲を再生します',
        options: [
            {
                name: 'url',
                type: 3, // STRING
                description: 'YouTubeのURL (例: https://www.youtube.com/watch?v=...)',
                required: true,
            },
        ],
    },
];

// 起動時処理
client.once('ready', async () => {
    console.log(`${client.user.tag} としてログインしました。`);
    
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('スラッシュコマンドを登録しました。');
    } catch (error) {
        console.error('コマンド登録エラー:', error);
    }
});

// コマンド実行
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'sound') {
        const rawUrl = interaction.options.getString('url');
        
        // URLのクリーニング（&list= などの余計なパラメータを除去）
        const url = rawUrl.split('&')[0];
        
        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: '先にボイスチャンネルに参加してください。', ephemeral: true });
        }

        await interaction.deferReply();

        const channel = interaction.member.voice.channel;
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        try {
            // YouTubeからストリームを取得
            // play-dlは自動的に適切なクエリを探します
            let stream = await play.stream(url, {
                quality: 2, // 最高音質設定
                seek: 0
            });

            const resource = createAudioResource(stream.stream, {
                inputType: stream.type,
            });

            const player = createAudioPlayer({
                behaviors: { noSubscriber: NoSubscriberBehavior.Play },
            });

            player.play(resource);
            connection.subscribe(player);

            // エラーハンドリング
            player.on('error', error => {
                console.error(`Player Error: ${error.message}`);
            });

            player.on(AudioPlayerStatus.Idle, () => {
                // 再生が終わったら自動で抜ける場合はここ（現在は接続維持）
                // connection.destroy();
            });

            await interaction.editReply(`再生中 🎶: ${url}`);
        } catch (error) {
            console.error('再生エラーの詳細:', error);
            await interaction.editReply('再生中にエラーが発生しました。YouTubeの規制によりデータセンターからのアクセスが拒絶されている可能性があります。');
            
            // 接続をクリーンアップ
            if (connection) connection.destroy();
        }
    }
});

// ログイン
client.login(TOKEN);