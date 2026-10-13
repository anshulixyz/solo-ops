/* docs/launch/conversations/chats.js — the chat-only story (Story 2), verbatim.
   Rendered by mock/chat.html?c=<id>. Every "user" turn is what Mara pastes or
   types; the prompt text is the real Guide prompt in chat mode (title shown,
   body folded in the frame because it carries the snapshot). Every assistant
   reply ends in the exact block the Reply tab accepts; each block was run
   through the Reply tab's preview on the seed project before the shot. */
window.CHATS = {
  '11-chat-standup-1': {
    assistant: 'Claude', title: 'Tuesday standup',
    messages: [
      { role: 'user', pasted: 'Daily standup · copied from the Guide (chat mode, with the snapshot of Pocket Studio)', text: 'You are my operations partner for my Solo Ops workspace "Pocket Studio" (id main). You cannot run commands or open files, so: read the snapshot I paste, think, ask me what you need, and when we agree on changes end your reply with them as command lines (format at the end of this message).\n\nRead the snapshot, then run a standup with me: ask (1) what I finished since yesterday, (2) the ONE thing today is about, (3) what is blocking me. Wait for my answers. Then update the board (done / start / note / step as needed), and give me today\'s plan: max 3 items, in order, each with what "done" looks like.\n\nSNAPSHOT: …' },
      { role: 'assistant', text: 'Morning. Three things, one at a time:\n\n1. What did you finish since yesterday? (The board still shows *Landing page copy, final pass* and *Record the 60-second demo* in Doing.)\n2. What is the one thing today is about?\n3. What is blocking you?' }
    ]
  },
  '12-chat-standup-2': {
    assistant: 'Claude', title: 'Tuesday standup',
    messages: [
      { role: 'user', text: 'Finished the landing page copy last night. Today is about the launch post. Blocking: Priya\'s intro is on Thursday and I still haven\'t replied to her email.' },
      { role: 'assistant', text: 'Then today is three things, in this order:\n\n1. **Reply to Priya** — 10 minutes, before anything else. Done = sent, and the Thursday 14:00 slot confirmed.\n2. **Write the launch post** — the four steps are already on the card; start with the problem line. Done = all four steps ticked and a draft in the Writing Viewer.\n3. **Demo, take 2** — only if there is time after 15:30; your note says re-record from beat 2.\n\nI am marking the landing page done, moving the launch post to Doing with a note, and adding Priya as a high task due tomorrow. Say if you want it different.', code: 'done "Landing page copy"\nstart "Write the launch post"\nnote "Write the launch post" "Lead with the Sunday line from the first post"\nadd "Reply to Priya before the intro" --pri high --due 2026-10-14' }
    ]
  },
  '15-chat-capture': {
    assistant: 'ChatGPT', title: 'Pricing for Pocket Studio',
    messages: [
      { role: 'user', text: 'Help me think through pricing. Two tiers feels right but I keep going back and forth.' },
      { role: 'assistant', text: 'Two tiers is right for launch. The question is where the line sits. What do the twelve beta testers actually do in a week — clips, exports, platforms?' },
      { role: 'user', text: 'Most make 3 to 6 clips a week. Two of them do 20+. Everyone exports to X; half also to YouTube.' },
      { role: 'assistant', text: 'Then the free tier is 10 clips a month: generous for the many, a wall for the two heavy users, who are exactly the people who will pay. Pro at $12 a month, unlimited clips, both platforms. One table on the pricing page, no FAQ on it. Annual discount: decide later, it is a distraction this week.' },
      { role: 'user', text: 'Agreed. I also want to ask a few testers what they would pay before I print a number.' },
      { role: 'assistant', text: 'Ask the three most active, one question by email, collect by Friday. Then the number is theirs, not yours.' },
      { role: 'user', pasted: 'Turn this conversation into tasks · copied from the Guide (chat mode)', text: 'From everything above in this conversation, pull out the work: one task per concrete thing to do, steps when we discussed how, high priority for anything blocking, tags from the topic. Skip what is already on the board. Show me the list, then add it to board "runway".\n\nSNAPSHOT: …' },
      { role: 'assistant', text: 'Three pieces of work came out of this. *Pricing page: two tiers, one table* is already on your board, so it gets the decisions as steps instead of a duplicate.\n\n- **Pricing page** — steps: Free is 10 clips a month · Pro is $12 a month, unlimited, both platforms · one table, no FAQ on the page\n- **Ask 3 beta testers what they would pay** (high) — the three most active, one question by email, collect by Friday\n- **Decide the annual discount** — parked until after launch\n\nAdding them now.', code: 'step "Pricing page" "Free: 10 clips a month"\nstep "Pricing page" "Pro: $12 a month, unlimited, both platforms"\nstep "Pricing page" "One table, no FAQ on the page"\nadd "Ask 3 beta testers what they would pay" --pri high --tags pricing,research --steps "Pick the three most active|One question by email|Collect by Friday" --due 2026-10-16\nadd "Decide the annual discount" --pri low --tags pricing --col later' }
    ]
  },
  '16-chat-emails-to-todos': {
    assistant: 'Claude', title: 'Inbox to to-dos',
    messages: [
      { role: 'user', pasted: 'Add tasks from this list · copied from the Guide (chat mode)', text: 'Turn what I paste below into tasks: one per item, a deadline when one is implied, high priority when someone is waiting on me, tags from the topic. Skip what is already on the board.\n\nSNAPSHOT: …\n\n---\nThree emails I owe replies to:\n\nFrom Jonas (beta tester): "Loved the captions. Can you send me the new build? The old one crashes on export."\n\nFrom Dana at The Maker Hour podcast: "We would love to have you on in November. Which week works?"\n\nFrom Lena: "I was charged twice on Friday, can you refund one?"' },
      { role: 'assistant', text: 'Three replies, two of them with someone waiting:\n\n- **Jonas** — send the new build today; his crash is the export bug already on your board, so I am linking the two in a note.\n- **Lena** — refund first, reply second, today.\n- **Dana** — pick a November week; this week is fine, by Friday.', code: 'add "Reply to Jonas: send the new beta build" --pri high --due 2026-10-13 --tags email,beta\nnote "Reply to Jonas" "His export crash is the open bug: Fix the export crash on long clips"\nadd "Refund Lena\'s duplicate charge, then reply" --pri high --due 2026-10-13 --tags email,support\nadd "Reply to Dana (The Maker Hour): pick a November week" --pri medium --due 2026-10-16 --tags email,press' }
    ]
  },
  '18-chat-mail-connector': {
    assistant: 'Claude', title: 'What do I owe this week',
    messages: [
      { role: 'user', pasted: 'Add tasks from this list · copied from the Guide (chat mode)', text: 'Turn what I paste below into tasks: one per item, a deadline when one is implied, high priority when someone is waiting on me, tags from the topic. Skip what is already on the board.\n\nSNAPSHOT: …\n\n---\nNothing to paste this time: check my mail. What do I owe replies to this week?' },
      { role: 'assistant', tools: ['Searched Gmail · is:unread newer_than:7d · 3 results', 'Read 3 emails'], text: 'Three people are waiting on you:\n\n- **Jonas** (beta tester) — wants the new build; his export crash is the bug already on your board, so I am linking the two in a note.\n- **Lena** — charged twice on Friday; refund first, then reply, tomorrow at the latest.\n- **Dana** at The Maker Hour — wants a November week for the podcast; this week is fine, by Friday.\n\nNothing else in the last seven days needs you. Here are the three as tasks.', code: 'add "Reply to Jonas: send the new beta build" --pri high --due 2026-10-14 --tags email,beta\nnote "Reply to Jonas" "His export crash is the open bug: Fix the export crash on long clips"\nadd "Refund Lena\'s duplicate charge, then reply" --pri high --due 2026-10-14 --tags email,support\nadd "Reply to Dana (The Maker Hour): pick a November week" --pri medium --due 2026-10-16 --tags email,press' }
    ]
  },
  '17-chat-done-update': {
    assistant: 'Claude', title: 'Landing page copy',
    messages: [
      { role: 'assistant', text: '…and the closing line stays: *Record on your phone, publish from your phone.* That is the whole product in nine words. The page is done.' },
      { role: 'user', pasted: 'Post about what I just shipped · copied from the Guide (chat mode)', text: 'I just finished something. Mark it done on the board, then write one post about it in my voice, two versions (one line / short story), and schedule the better one for the next free evening slot.\n\nSNAPSHOT: …\n\n---\nIt is the landing page copy — done, mark it.' },
      { role: 'assistant', text: 'Marked done. Two versions:\n\n**One line** — New landing page: one sentence, one button, one video. Took three drafts to get to one sentence.\n\n**Short story** — I rewrote the Pocket Studio landing page three times this week. Draft one explained the product. Draft two explained the problem. Draft three is one sentence and a button, and it is the only one anyone read to the end.\n\nScheduling the one-liner for tomorrow at 17:00, which is your next free evening slot.', code: 'done "Landing page copy"\nsocial add "The landing page is live" --at 2026-10-14T17:00 --type update --copy "New landing page: one sentence, one button, one video. Took three drafts to get to one sentence."' }
    ]
  }
};
