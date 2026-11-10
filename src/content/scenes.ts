import type { Scene } from "../engine/types";
import { F, FINALE_SUCCESS, FINALE_FAILED } from "../engine/endings";
import { queueAftermath } from "./queue";

// Narrative beats. Some just set the scene; a few are decisions that set the
// flags the ending resolver reads. No em dashes anywhere, by design.

export const SCENES: Scene[] = [
  // ---- Chapter intros / outros ----
  {
    id: "s1_intro",
    chapter: 1,
    lines: [
      { who: "narration", text: "Port Halden. A harbor town that smells of salt, diesel, and someone's excellent bread. Rain holds off, for once." },
      { who: "narration", text: "Lanternhouse Security runs out of the old pilot station beside the lighthouse. Fourteen people keep the whole town safe: its clinic, its school, its port, its water." },
      { who: "walter", text: "There they are. Our new analyst. I'm Walter, I started this place. Coffee's terrible, people are good. Packet is the cat, Packet runs the building, we just pay rent." },
      { who: "walter", text: "Here is the honest truth about a fourteen person shop. We hired you for your specialty, and you will live in it soon enough. But your first weeks, everyone works the whole queue. Help desk, triage, all of it." },
      { who: "walter", text: "Nobody understands an attack on this town until they have answered its phones and read its boring tickets first. So start small, close a few, whatever team they belong to. You specialize as you climb. Welcome to Lanternhouse." },
    ],
  },
  {
    id: "s1_outro",
    chapter: 1,
    lines: [
      { who: "theo", text: "First day down. You did real work and you did not break anything. That is a better first day than most." },
      { who: "narration", text: "Outside, the sky has gone the color of a held breath. The forecast says weather coming in." },
    ],
  },
  {
    id: "s2_intro",
    chapter: 2,
    lines: [
      { who: "narration", text: "Overcast now. The lighthouse beam is just visible through grey. Someone has turned on the desk lamps early." },
      { who: "mags", text: "You are off the easy queue. Real cases today. Read everything before you touch anything. Logs do not lie. People summarize them badly." },
      { who: "mags", text: "The alert queue is yours as well now. More comes in than anyone has time for. Open the ones that matter, make the call, and let the rest age out. Choosing is the job." },
    ],
  },
  {
    id: "s2_outro",
    chapter: 2,
    lines: [
      { who: "juno", text: "Two of your cases this week share a domain and an address. I pinned them to the board." },
      { who: "juno", text: "Probably nothing. It is usually nothing. But I have a bad habit of being right about the times it is not." },
    ],
  },
  {
    id: "s3_intro",
    chapter: 3,
    lines: [
      { who: "narration", text: "Rain at last, hard against the windows. The office is lamplight and shadow now, the cozy kind, if you ignore what you are about to read." },
      // what became of yesterday's alert queue
      ...queueAftermath(2),
      { who: "imani", text: "The clinic sent us a laptop. We all handle it right, together, and then each of us checks what it means in our own way. And we are very, very careful about one small word: who." },
    ],
  },

  // ---- Chapter 3 decision: the anonymous contact ----
  {
    id: "s3_brackish",
    chapter: 3,
    lines: [
      { who: "narration", text: "That night a message reaches your work account through a channel that should not be able to reach it. Encrypted. One sender. No name, just a handle: BRACKISH." },
      { who: "brackish", text: "You found the svc_tidewatch account. Good. Now ask the question nobody at Lanternhouse will ask you back." },
      { who: "brackish", text: "Ask why the HarborWatch password was never changed after St. Brennan's. Ask who got blamed five years ago. I am not the story here. The story is the door that was left open on purpose." },
      { who: "brackish", text: "I am not asking you to trust me. I am asking you to look." },
    ],
    choice: {
      prompt: "How do you respond?",
      options: [
        {
          text: "Hear them out. Reply carefully, keep the channel open, and keep looking.",
          setFlags: [F.trustNadia],
          integrity: 0,
          reply: [
            { who: "you", text: "I am listening. Tell me what you have. I check everything myself." },
            { who: "brackish", text: "Good. Careful is right. I will send what I can prove, nothing I cannot." },
          ],
        },
        {
          text: "Handle it by the book. Take the message straight to Mags.",
          setFlags: [F.toldMags],
          integrity: 1,
          reply: [
            { who: "mags", text: "You were right to bring this to me and not sit on it. I do not know who BRACKISH is. I do know everything they said about HarborWatch checks out. Keep your head down and keep documenting." },
          ],
        },
        {
          text: "Report it to Walter. He runs the place, he should know.",
          setFlags: [F.toldWalter],
          integrity: -1,
          reply: [
            { who: "walter", text: "Forward me everything and then do not touch it again. Some old wound at the clinic, that is all this is. Let it stay buried. For your own sake, and the firm's." },
            { who: "narration", text: "Walter's warmth does not quite reach his eyes this time. He knew the name St. Brennan's before you said it." },
          ],
        },
      ],
    },
  },

  {
    id: "s4_intro",
    chapter: 4,
    lines: [
      { who: "narration", text: "A full gale now. Lightning throws the office white, then dark. Everyone is working late and nobody is saying why." },
      ...queueAftermath(3),
      { who: "juno", text: "The crew calling themselves the Tollkeepers just moved on the water plant. Ransomware, loud and fast. That is not the quiet visitor who has been collecting proof. That is something else, and it is circling." },
      { who: "rook", text: "And tonight, in your own corner of this, someone is going to ask you to bend one rule, just once, for a good reason. That is the real test. Do not." },
    ],
  },

  // ---- Chapter 4 decision: Walter's offer ----
  {
    id: "s4_walter_offer",
    chapter: 4,
    requires: ["knows_truth"],
    lines: [
      { who: "narration", text: "Walter asks you to stay after the others leave. He pours two coffees and does not drink his." },
      { who: "walter", text: "You are good. Better than good, this fast. So let me be straight with you, the way I wish someone had been with me." },
      { who: "walter", text: "St. Brennan's, five years ago, that was my mistake. The password, the alerts, the analyst I let go, Nadia Sorel. I have carried it every day since. But if it comes out now, Lanternhouse is finished, and this whole town loses the people who protect it." },
      { who: "walter", text: "I am making you Senior Analyst. Real money, real authority. All I ask is that the clinic stays in the past, where it belongs. Can you give me that?" },
    ],
    choice: {
      prompt: "What do you say to Walter?",
      options: [
        {
          text: "Take the promotion. The town needs Lanternhouse more than it needs an old scandal.",
          setFlags: [F.buriedTruth],
          integrity: -3,
          reply: [
            { who: "you", text: "The past stays in the past. You have my word." },
            { who: "walter", text: "Then it is done. You are Senior Analyst as of tonight, with the pay to match. I did this once myself. Do not make my mistake, make the better version of it." },
          ],
        },
        {
          text: "Decline. The truth about St. Brennan's is not yours to bury, and neither is the analyst's name.",
          integrity: 2,
          reply: [
            { who: "you", text: "I cannot promise that, Walter. Someone already paid for this once, unfairly. I will not help it happen twice." },
            { who: "walter", text: "Then we leave it there. The Senior role, and the raise, go to someone who puts the firm first. You stay exactly where you are. We will both pretend this was a warmer conversation than it was." },
            { who: "narration", text: "He is smiling again by the time he reaches the door. It costs you the promotion and, you suspect, a good deal more. It buys you the one thing you can still look at in the mirror." },
          ],
        },
      ],
    },
  },

  // ---- Chapter 5: the finale ----
  {
    id: "s5_intro",
    chapter: 5,
    lines: [
      // the gale's alert queue, settled before the lights go
      ...queueAftermath(4),
      { who: "narration", text: "The storm takes the grid at 21:40. Emergency lights snap on, everything washed in red. The lighthouse keeps turning on its own generator, patient as ever." },
      { who: "narration", text: "Then the alert from Halden Water and Light. Someone is inside, moving toward the one network that must never be touched: the controls that keep the town's water safe." },
      { who: "narration", text: "This is not the quiet visitor who has been gathering proof. This is the Tollkeepers, the ransomware crew, moving fast with the one shared password that still works." },
      { who: "mags", text: "This is it. This is the one all the quiet weeks were practice for. Read the situation first. Then we decide together." },
    ],
  },
  {
    id: "s5_contain",
    chapter: 5,
    requires: ["finale_ready"],
    lines: [
      { who: "mags", text: "They are on the jump box in the business network, probing the boundary to the control systems. They got in with the HarborWatch credential. The same one. Your call on how we cut them off. Fast." },
    ],
    choice: {
      prompt: "How do you contain this?",
      options: [
        {
          // The clean save is only on the table if you kept the boundary tight
          // and read the recon properly. Leave a door open or botch the recon
          // and this option is closed, and the game says which of the two did it.
          text: "Cut it at the root: disable the HarborWatch shared credential everywhere and isolate the jump box from the OT boundary.",
          locks: [
            { all: [F.openDoor], note: "Closed. The door you opened in chapter four is already their way past the jump box. Cutting the credential now comes too late to hold the boundary." },
            ...["t5_plant_recon", "t5_network", "t5_helpdesk", "t5_forensics", "t5_pentest", "t5_intel"].map((id) => ({
              all: [`botched_${id}`],
              note: "Closed. The case you botched tonight was your part of this. Without it, nobody in the room can say for certain where to cut.",
            })),
          ],
          setFlags: [FINALE_SUCCESS],
          integrity: 2,
          reply: [
            { who: "narration", text: "You kill the credential on every system at once. The attacker's access evaporates mid-probe, the same key failing in every lock. The jump box goes dark and quiet. The boundary to the control network never opens." },
            { who: "mags", text: "Gone. Access cut at the source, not chased around the network. The water is safe. That is exactly how you do it." },
          ],
        },
        {
          text: "Block the hosting address 203.0.113.77 at the firewall and call it contained.",
          setFlags: [FINALE_FAILED],
          integrity: 0,
          reply: [
            { who: "narration", text: "You block the address. For ninety seconds, nothing. Then the same credential reappears from a different host, because blocking one address never took the key away." },
            { who: "mags", text: "No, no, they still have the credential. They are through the boundary. We chased the address and left the door key in the lock." },
          ],
        },
        {
          text: "Hold off on anything drastic and keep watching to gather more evidence first.",
          setFlags: [FINALE_FAILED],
          integrity: -1,
          reply: [
            { who: "narration", text: "You watch a few seconds too long. The probe becomes a push. The boundary gives." },
            { who: "mags", text: "We needed to move. Evidence does not matter if the water is not safe. Remember that, if we get another chance at this." },
          ],
        },
      ],
    },
  },
  {
    id: "s5_evidence",
    chapter: 5,
    // A failed containment goes straight to Dead Water, so the evidence choice
    // would change nothing. Skip it rather than offer a hollow decision.
    hideIf: [FINALE_FAILED],
    lines: [
      { who: "narration", text: "Whatever just happened at the plant, the bigger question is still on the table, and it is yours to answer. You hold everything now: the five-year cover-up, the unrotated password, the name behind BRACKISH." },
      { who: "brackish", text: "You have it all. So do I, almost. What happens next depends on what you do with yours." },
      { who: "walter", text: "Think very carefully about the next thing you do. A lot of good people's jobs are in your hands, mine included." },
    ],
    choice: {
      prompt: "What do you do with the evidence?",
      options: [
        {
          text: "Report everything externally: to the client, the regulator, and the national response office, with the full documented chain.",
          setFlags: [F.reportedOut],
          integrity: 2,
          reply: [
            { who: "you", text: "This goes to the people who can actually fix it, all of it, properly documented. No more buried wounds." },
            { who: "walter", text: "You gave me your word. I made you Senior Analyst on it. I should have known a promise bought with a title was worth exactly what I paid for it.", showIf: [F.buriedTruth] },
          ],
        },
        {
          // Open only if you never handed her to Walter in chapter three and
          // never took his promotion in chapter four. Do either and she will
          // not trust you with the story.
          text: "Give the evidence to BRACKISH so she can publish it herself.",
          locks: [
            { all: [F.toldWalter], note: "Closed. In chapter three you took her first message straight to Walter. She will not take anything from you now." },
            { all: [F.buriedTruth], note: "Closed. In chapter four you took Walter's promotion to keep St. Brennan's buried. She will not take anything from you now." },
          ],
          setFlags: [F.gaveNadia],
          integrity: 0,
          reply: [
            { who: "you", text: "You were the first person this happened to. You should be the one to tell it." },
            { who: "brackish", text: "You listened. Nobody did, back then. Thank you." },
          ],
        },
        {
          // Once Mags has BRACKISH's message it is no longer yours alone to
          // bury, unless you have since thrown in with Walter.
          text: "Stop the attack, but keep the St. Brennan's link inside the company.",
          locks: [{ all: [F.toldMags], none: [F.buriedTruth], note: "Closed. In chapter three you took BRACKISH's message to Mags, and she has held it ever since. This stopped being yours to bury that night." }],
          setFlags: [F.coveredUp],
          integrity: -2,
          reply: [
            { who: "you", text: "The town is safe. The rest stays here." },
            { who: "walter", text: "You are a Director now. I will not forget this. Nobody else will ever know there was anything to forget." },
          ],
        },
      ],
    },
  },
];

export function sceneById(id: string): Scene | undefined {
  return SCENES.find((s) => s.id === id);
}
