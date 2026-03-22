# Critical Soundtrack

Módulo para **FoundryVTT** · Foundry v11–v13 · D&D 5e · PF2e · sistemas d20

---

## Português

Toca automaticamente a trilha sonora pessoal de um personagem quando ele realiza um acerto crítico. A atribuição é feita pelo menu de contexto das playlists na barra lateral — sem janelas extras.

### Instalação

1. No Foundry, abra **Instalar Módulo** e cole a URL do `module.json` no campo de manifesto.
2. Ative o módulo em **Gerenciar Módulos**.

### Como usar

1. Crie uma playlist na aba **Playlists** e adicione as faixas desejadas.
2. Clique com o **botão direito** na playlist → **Definir como Trilha Crítica…**
3. Selecione o personagem e clique em **Atribuir**.
4. Pronto — sempre que o personagem tirar um crítico, a faixa toca automaticamente.

> Apenas o GM enxerga as opções no menu de contexto. O sistema nativo de playlists do Foundry sincroniza o áudio com todos os jogadores.

### Configurações

| Configuração | Padrão | Descrição |
|---|---|---|
| Ativar módulo | Sim | Liga/desliga sem apagar as atribuições |
| Apenas Personagens Jogadores | Não | Limita o disparo a personagens do tipo `character` |
| Exibir aviso de playlist vazia | Não | Notifica quando um crítico ocorre sem playlist atribuída |

---

## English

Automatically plays a character's personal soundtrack when they score a critical hit. Everything is managed through the playlist context menu in the sidebar — no extra windows.

### Installation

1. In Foundry, open **Install Module** and paste the `module.json` URL into the manifest field.
2. Enable the module under **Manage Modules**.

### How to use

1. Create a playlist in the **Playlists** tab and add your tracks.
2. Right-click the playlist → **Set as Critical Soundtrack…**
3. Select the character and click **Assign**.
4. Done — whenever that character scores a critical hit, the track plays automatically.

> Only the GM sees the context menu options. Foundry's native playlist system syncs the audio to all players.

### Settings

| Setting | Default | Description |
|---|---|---|
| Enable module | Yes | Toggle on/off without clearing assignments |
| Only Player Characters | No | Restricts triggers to actors of type `character` |
| Show 'No Playlist' warning | No | Notifies when a critical hit occurs with no playlist assigned |
