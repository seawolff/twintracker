import { AUTHOR_NAME, BASE_URL } from '../site';

export type PostSection = {
  title: string;
  paragraphs?: string[];
  bullets?: string[];
  callout?: string;
  feature?: string;
};

export type PostFaq = {
  question: string;
  answer: string;
};

export type PostImage = {
  src: string;
  alt: string;
  caption: string;
};

export type Post = {
  slug: string;
  title: string;
  seoTitle: string;
  description: string;
  excerpt: string;
  category: string;
  keywords: string[];
  publishedAt: string;
  updatedAt: string;
  readTime: string;
  tiktokUrl?: string;
  tiktokEmbedUrl?: string;
  heroNote?: string;
  intro: string[];
  sections: PostSection[];
  images?: PostImage[];
  faq: PostFaq[];
};

export const posts: Post[] = [
  {
    slug: 'how-i-got-my-7-month-old-twins-to-sleep-through-the-night',
    title: 'How I Got My 7 Month Old Twins To Sleep Through The Night',
    seoTitle:
      'How I Got My 7 Month Old Twins To Sleep Through the Night: 7 Month Twin Sleep Schedule',
    description:
      'A practical twin sleep post for 7 month olds: our 7 PM to 7 AM routine, 4-hour feed-play-nap rhythm, blackout room, white noise, self-soothing window, and how to shift late feeds earlier.',
    excerpt:
      'The exact routine that helped our 7 month old twins start sleeping through the night, including a sample daytime schedule and how we shifted late feeds earlier.',
    category: 'Twin Sleep',
    keywords: [
      '7 month old twins sleep through the night',
      '7 month twin sleep schedule',
      'twin sleep training',
      'how to get twins to sleep through the night',
      'twin bedtime routine',
      '4 hour feed play nap schedule',
      '7pm to 7am baby schedule',
      'sleep training twins 7 months',
    ],
    publishedAt: '2026-04-22',
    updatedAt: '2026-04-22',
    readTime: '7 min read',
    tiktokUrl: 'https://www.tiktok.com/@twintracker/video/7631319073669844237',
    tiktokEmbedUrl:
      'https://www.tiktok.com/embed/v2/7631319073669844237?lang=en-US',
    heroNote:
      'This post expands on the TwinTracker TikTok about how our 7 month old twins started sleeping through the night.',
    intro: [
      'The biggest shift for us at 7 months was not one magic product or one heroic bedtime routine. It was finally treating the whole day like a schedule instead of a series of guesses.',
      'Once we anchored the day around a consistent 7 PM to 7 AM overnight window, two real crib naps, daytime feeds, blackout sleep, and a predictable response when they cried, sleep started to feel teachable instead of chaotic.',
      'This is not medical advice, and it is not the only way to do twin sleep. It is simply the combination that finally worked for our family and gave us a repeatable twin sleep rhythm.',
    ],
    sections: [
      {
        title: '1. We anchored the whole day around a 7 PM to 7 AM schedule',
        paragraphs: [
          'At 7 months, the most important change was treating 7 PM to 7 AM as the target overnight sleep window. That gave the entire day a clear shape and made it easier to know whether a nap, a feed, or bedtime was the real next step.',
          'The consistency mattered as much as the exact hour. A stable wake time in the morning helped the naps land better, and better naps made bedtime easier instead of more dramatic.',
        ],
        bullets: [
          'Wake at about 7 AM',
          'Protect bedtime around 7 PM',
          'Avoid letting the day drift later and later',
          'Keep the wake-up time stable even after a rough night',
        ],
        callout:
          'For us, the day started working once bedtime and wake time stopped moving around.',
        feature:
          'TwinTracker lets you set target wake and bedtime hours. The app can use those anchors to show whether the next step is really another nap, a feed before bed, or the final move toward bedtime.',
      },
      {
        title: '2. Use a 4-hour feed, play, nap rhythm',
        paragraphs: [
          'For 4 to 18 months, the sleep-training rhythm we use is a 4-hour feed, play, nap rhythm. It reduces the constant second-guessing and makes it easier to tell whether babies are overtired, undertired, or simply off rhythm.',
          'The key is aiming for all meaningful feeds during the day instead of letting late-evening calories stay scattered and random.',
        ],
        bullets: [
          '7:00 AM feed',
          '9:00 AM to 11:00 AM nap',
          '11:00 AM feed',
          '1:00 PM to 3:00 PM nap',
          '3:00 PM feed',
          'Bed around 7:00 PM',
        ],
        callout:
          'That example day was much easier to repeat than a loose “watch the clock and hope” approach.',
        feature:
          'TwinTracker turns the 4-hour rhythm into the baby card itself by showing feed timing, sleep timing, and diaper timing together. Instead of remembering the entire loop manually, you can glance at the card and see what is coming next.',
      },
      {
        title: '3. We made naps real naps, not random little dozes',
        paragraphs: [
          'A big difference at 7 months was expecting two real crib naps instead of a patchwork of short accidental sleep. Once the naps got more predictable, night sleep improved because bedtime no longer had to compensate for a chaotic day.',
          'This matched what we were already building into TwinTracker: two solid daytime naps for this age, then a protected bedtime window instead of squeezing in extra late sleep unless there is a real reason.',
          'It also meant phasing out the late catnap. A short 5 to 6 PM catnap can help for a while, but by this stage we wanted the day to consolidate around two real crib naps and a cleaner move toward bedtime.',
        ],
        bullets: [
          'Try to keep naps in the crib rather than always rescuing them with motion',
          'Use the same sleep conditions for naps and night sleep',
          'Do not let every short nap turn the rest of the day into improvisation',
        ],
        feature:
          'TwinTracker separates daytime naps from night sleep and tracks how long each sleep period has been going. A nap and overnight sleep are not the same decision, especially once bedtime becomes the priority.',
      },
      {
        title: '4. We made every sleep period feel the same',
        paragraphs: [
          'For every nap and bedtime, we used a pitch black room and loud white noise. The goal was to make sleep feel obvious and consistent instead of stimulating and different every time.',
          'That sameness mattered a lot with twins because you are not just helping one baby wind down. You are managing an environment that has to support both babies reliably.',
          'We also practiced putting them in the crib sleepy but still awake, instead of always rocking or feeding them completely to sleep first. The point was to help sleep start in the crib, in the same environment, with the same cues, over and over again.',
        ],
        bullets: [
          'Blackout room for naps and overnight sleep',
          'White noise every time, not just on hard days',
          'Low-stimulation sleep space that feels familiar',
          'When possible, put baby down sleepy but still awake so they can practice falling asleep in the crib',
        ],
        feature:
          'In TwinTracker, putting a child down gives you a clear sleep state and timing context right away. That helps distinguish “they have been down for 10 minutes” from “this nap is running long” without mental math.',
      },
      {
        title: '5. We stopped rushing in immediately',
        paragraphs: [
          'Another major change was giving them a self-soothing window before going in right away. Around this age, that usually looked more like 30 to 45 minutes than the very short windows we used when they were much younger.',
          'That did not mean ignoring them forever. It meant giving them a real chance to settle instead of assuming every cry required instant intervention.',
        ],
        bullets: [
          'Count the uninterrupted crying window, not every tiny sound',
          'If crying stops and starts again, mentally reset the timer',
          'Be consistent enough that bedtime does not become a new experiment every night',
        ],
        callout:
          'The emotional difficulty is real. Calm consistency was still more helpful for our twins than frantic inconsistency.',
        feature:
          'This is one reason TwinTracker includes a timer after putting a child down. When a baby is crying, it is surprisingly hard to know whether it has been 4 minutes or 24 minutes. A visible timer makes the self-soothing window concrete instead of emotional guesswork.',
      },
      {
        title: '6. If we did go in, we kept it boring',
        paragraphs: [
          'When we did need to go in, we kept the interaction flat and predictable: no lights, no play, no big social reset. We wanted the message to stay the same: it is still sleep time.',
          'That was especially important overnight. The more interesting the response became, the more likely sleep turned into another awake window.',
          'Minimal overnight interaction matters because babies are incredibly good at detecting whether the night is becoming social, stimulating, or feed-driven again. We wanted overnight support to feel calm and quiet, not like the start of a new day.',
        ],
        bullets: [
          'Keep lights off',
          'Keep the room quiet except for white noise',
          'Avoid turning the check-in into playtime',
          'Handle what needs to be handled, then leave consistently',
        ],
        feature:
          'TwinTracker’s night mode and sleep-focused state help reinforce that same idea in the app. At night, the useful question is usually not “what else can I log?” It is “are they still sleeping, do they need support, or is this a real wake?”',
      },
      {
        title: '7. If your baby still expects a later feed, shift it gradually',
        paragraphs: [
          'One of the most useful things we learned is that daytime feeding usually has to be intentional. If a child is used to taking calories too late, it can help to put them down later at first and then slowly move that last feed earlier and earlier until it lands about 12 hours from the designated morning wake-up time.',
          'In other words, if your target wake is 7 AM, work toward the last meaningful daytime feed happening around 7 PM. Do not expect that shift to happen cleanly in one night if your current routine is much later.',
        ],
        bullets: [
          'Start from the schedule your child is actually used to',
          'Move the late feed earlier gradually instead of forcing a huge jump',
          'Keep the morning wake anchor stable while you shift the evening',
          'Aim for daytime calories instead of drifting into late-night feeding habits',
        ],
        feature:
          'This is where the feed countdown in TwinTracker is helpful. If the next normal feed would collide with bedtime, the app can surface a “feed by” style recommendation instead of leaving you to back-calculate the last bottle yourself.',
      },
      {
        title: '8. What finally worked for us',
        paragraphs: [
          'What finally worked was not one trick. It was the combination: a consistent schedule, two real naps, a blackout room, white noise, daytime feeds, and enough space for self-soothing.',
          'That combination gave our twins the same signals over and over again until sleep stopped feeling random. Once it clicked, the entire household felt calmer.',
          'We eventually baked this same logic into TwinTracker so you do not have to mentally run the whole sleep schedule yourself every day. Instead of manually tracking every wake window and bedtime calculation in your head, the app keeps the rhythm visible for you.',
          'That means you can open TwinTracker and immediately see the next likely nap, bedtime timing, feed timing, and the broader shape of the day without rebuilding the schedule from scratch. The same sleep-training ideas from this post are part of the product experience, not a separate system you have to remember on your own.',
          'If this post sounds like the kind of structure you want, TwinTracker was built to make that structure easier to follow in real life.',
        ],
        callout:
          'TwinTracker bakes this schedule logic into the app so you do not have to manually track your child’s sleep rhythm on your own.',
      },
    ],
    images: [
      {
        src: '/posts/twintracker-sleep-training-timer-example.png',
        alt: 'TwinTracker baby cards showing Lucas and Mia sleeping with a sleep training wait timer',
        caption:
          'This is the payoff: TwinTracker bakes the sleep-training window into the baby card so you can see how long each child has been down and how long to wait before intervening, without manually timing it in your head.',
      },
    ],
    faq: [
      {
        question: 'What schedule worked for your 7 month old twins?',
        answer:
          'The simplest version was 7 AM feed, 9 to 11 AM nap, 11 AM feed, 1 to 3 PM nap, 3 PM feed, then bed around 7 PM. The bigger principle was a stable 7 PM to 7 AM overnight anchor and a 4-hour feed, play, nap rhythm.',
      },
      {
        question: 'How long did you give your twins to self-soothe at 7 months?',
        answer:
          'At this age, we usually gave a real self-soothing window of about 30 to 45 minutes before going in. If crying stopped and restarted, we treated that as a new uninterrupted stretch rather than one endless timer.',
      },
      {
        question: 'What if my baby is still used to feeding later at night?',
        answer:
          'Start from the routine your baby already expects, then gradually move the last feed earlier until it lines up with your target bedtime and daytime feeding pattern. If your goal wake-up time is 7 AM, work toward the last meaningful feed happening about 12 hours later, around 7 PM.',
      },
      {
        question: 'What sleep environment helped your twins most?',
        answer:
          'The biggest environment changes were a blackout room and consistent white noise for every nap and bedtime. Keeping sleep conditions the same every time made the schedule easier to teach and repeat.',
      },
    ],
  },
];

export function getAllPosts(): Post[] {
  return [...posts].sort(
    (a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime(),
  );
}

export function getPostBySlug(slug: string): Post | undefined {
  return posts.find(post => post.slug === slug);
}

export function getPostUrl(slug: string): string {
  return `${BASE_URL}/posts/${slug}`;
}

export function buildArticleBody(post: Post): string {
  const parts = [
    post.title,
    ...post.intro,
    ...post.sections.flatMap(section => [
      section.title,
      ...(section.paragraphs ?? []),
      ...(section.bullets ?? []),
      ...(section.callout ? [section.callout] : []),
    ]),
    ...post.faq.flatMap(item => [item.question, item.answer]),
  ];
  return parts.join(' ');
}

export const publisher = {
  '@type': 'Organization',
  name: 'TwinTracker',
  url: BASE_URL,
};

export const author = {
  '@type': 'Person',
  name: AUTHOR_NAME,
  url: BASE_URL,
};
