const { Client, GatewayIntentBits, InteractionType, REST, Routes } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, NoSubscriberBehavior } = require('@discordjs/voice');
const play = require('play-dl');
const express = require('express');
const app = express();

// --- 1. Render Keep-alive (Express) ---
const PORT = process.env.PORT || 8080;
app.get('/', (req, res) => res.send('Bot is Alive!'));
app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));

// --- 2. Discord Bot Setup ---
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
        description: 'YouTubeから曲を再生します',
        options: [
            {
                name: 'url',
                type: 3, // STRING
                description: 'YouTubeのURL',
                required: true,
            },
        ],
    },
];

// --- 3. 起動時の処理 (コマンド登録) ---
client.once('ready', async () => {
    console.log(`${client.user.tag} としてログインしました。`);
    
    const rest = new REST({ version: '10' }).setToken(TOKEN);
    try {
        console.log('スラッシュコマンドを登録中...');
        await rest.put(
            Routes.applicationCommands(client.user.id),
            { body: commands },
        );
        console.log('コマンドの登録に成功しました。');
    } catch (error) {
        console.error(error);
    }
});

// --- 4. コマンド実行のリスナー ---
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'sound') {
        const url = interaction.options.getString('url');
        
        // ユーザーがVCにいるか確認
        if (!interaction.member.voice.channel) {
            return interaction.reply({ content: '先にボイスチャンネルに参加してください！', ephemeral: true });
        }

        await interaction.deferReply();

        const channel = interaction.member.voice.channel;
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: interaction.guild.id,
            adapterCreator: interaction.guild.voiceAdapterCreator,
        });

        try {
            // YouTube動画をストリームとして取得
            let stream = await play.stream(url);
            const resource = createAudioResource(stream.stream, {
                inputType: stream.type,
            });

            const player = createAudioPlayer({
                behaviors: { noSubscriber: NoSubscriberBehavior.Play },
            });

            player.play(resource);
            connection.subscribe(player);

            player.on(AudioPlayerStatus.Idle, () => {
                // 再生終了時に5分待機してから切断（任意）
                setTimeout(() => {
                    if (player.state.status === AudioPlayerStatus.Idle) connection.destroy();
                }, 300000);
            });

            await interaction.editReply(`再生を開始します: ${url}`);
        } catch (error) {
            console.error(error);
            await interaction.editReply('再生中にエラーが発生しました（URLが正しいか確認してください）。');
            connection.destroy();
        }
    }
});

client.login(TOKEN);