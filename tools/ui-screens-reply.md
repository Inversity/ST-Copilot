Here is one proposal of each kind, for the UI screenshots. Nothing is applied until you accept it.

```lorebook-changes
{"changes":[
  {"action":"add","worldName":"Bench Lore","name":"Lantern Road","triggers":["Lantern Road"],"content":"The Lantern Road runs north from the ford; its posts are lit at dusk.","constant":false},
  {"action":"delete","worldName":"Bench Lore","name":"Brackenmoor"}
]}
```

```character-changes
<overwrite char="Bench Ranger" field="scenario">Ranger guides travellers along the Lantern Road through the spring rains.</overwrite>
<append_text char="Bench Ranger" field="personality">Keeps the map dry under oilcloth, always.</append_text>
<append char="Bench Ranger" field="alternate_greetings">*Ranger waits at the ford, lantern lit.* "The river is high. We take the ridge path."</append>
```

```character-create
{
  "name_suggestion": "Mock Cartographer",
  "tags": "travel, maps",
  "description": "A careful mapmaker who walks every road before drawing it.",
  "personality": "Patient, exact, dry humour.",
  "scenario": "Charting the Lantern Road with {{user}}.",
  "first_mes": "*She unrolls a half-finished map.* \"Tell me where the road bends.\"",
  "mes_example": "<START>\n*{{char}} taps the map.* \"Here. The ford.\""
}
```

```chat-changes
{"changes":[
  {"action":"append","msg_index":2,"content":" The lantern light catches the water."},
  {"action":"hide","msg_range":[3,4]}
]}
```

```prompt-changes
<append id="main">Keep descriptions of the road short.</append>
<toggle id="jailbreak" enabled="false"/>
```
