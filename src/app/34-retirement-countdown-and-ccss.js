// ============================================================
// RETIREMENT COUNTDOWN
// ============================================================

document.getElementById('pm-calc-retirement-btn')?.addEventListener('click', calculateTeachingStats);

async function calculateTeachingStats() {
    const startDate      = document.getElementById('pm-start-teaching-date')?.value;
    const retirementDate = document.getElementById('pm-retirement-date')?.value;
    const daysPerYear    = parseInt(document.getElementById('pm-days-per-year')?.value) || 0;
    const expEl          = document.getElementById('experience-result');
    const retEl          = document.getElementById('retirement-result');

    if (!daysPerYear || daysPerYear < 1) { showToast('Enter school days per year'); return; }
    if (!startDate && !retirementDate)    { showToast('Enter at least one date'); return; }
    if (!hasEffectiveAiKey())             { showToast('Add an API key in the AI tab'); return; }

    const loading = '<div class="stats-calculating">🤖 Calculating…</div>';
    if (startDate   && expEl) { expEl.classList.remove('hidden'); expEl.innerHTML = loading; }
    if (retirementDate && retEl) { retEl.classList.remove('hidden'); retEl.innerHTML = loading; }

    const today       = new Date();
    const todayStr    = formatDate(today);
    const currentSY   = settings.schoolYear || '2025-2026';
    const yearStart   = settings.yearStart  || (currentSY.split('-')[0] + '-08-01');
    const yearEnd     = settings.yearEnd    || (currentSY.split('-')[1] + '-05-25');
    const dpm         = (daysPerYear / 10).toFixed(2);   // school days per month (10 month school year)

    const prompt = `You are a precise school-days calculator for a teacher's career stats.

TODAY: ${todayStr}
SCHOOL YEAR: ${currentSY}  (runs approx ${yearStart} – ${yearEnd})
SCHOOL DAYS PER YEAR: ${daysPerYear}
Derived: days per month = ${dpm} (${daysPerYear}÷10), days per week = 5

${startDate ? `TEACHING START DATE: ${startDate}` : ''}
${retirementDate ? `TARGET RETIREMENT DATE: ${retirementDate}` : ''}

INSTRUCTIONS:
For each date range, count school days by:
1. Days remaining/elapsed in the CURRENT/STARTING partial school year
2. Complete full school years × ${daysPerYear}
3. Days in any ENDING partial school year
Then derive weeks (÷5), months (÷${dpm}), years (÷${daysPerYear}) — round to 1 decimal.

Return ONLY valid compact JSON, NO markdown:
{
  ${startDate ? `"experience": {
    "totalDays": <int>,
    "totalWeeks": <number 1dp>,
    "totalMonths": <number 1dp>,
    "totalYears": <number 1dp>,
    "message": "<one inspiring sentence about their teaching journey so far>"
  }` : ''}${startDate && retirementDate ? ',' : ''}
  ${retirementDate ? `"countdown": {
    "totalDays": <int>,
    "totalWeeks": <number 1dp>,
    "totalMonths": <number 1dp>,
    "totalYears": <number 1dp>,
    "retirementYear": <int>,
    "message": "<one motivating sentence mentioning when they retire>"
  }` : ''}
}`;

    try {
        const raw    = (await callAIText({ prompt, tier: 'fast', maxTokens: 600 })).replace(/```json|```/g, '').trim();

        const result = JSON.parse(raw);

        // Cache to profile
        if (!settings.userProfile) settings.userProfile = {};
        settings.userProfile.startTeachingDate = startDate || settings.userProfile.startTeachingDate;
        settings.userProfile.retirementDate    = retirementDate || settings.userProfile.retirementDate;
        settings.userProfile.daysPerYear       = daysPerYear;
        settings.userProfile.lastCalc          = { ...result, calcDate: todayStr };
        // v6.3.0: keep the result even if the profile form is never saved
        if (currentUser) {
            db.collection('users').doc(currentUser.uid).collection('settings').doc('schoolYear')
                .set({ userProfile: settings.userProfile }, { merge: true })
                .catch(e => console.warn('save teaching stats:', e.message));
        }

        if (result.experience && expEl) renderStatsCard(expEl, result.experience, 'experience');
        if (result.countdown  && retEl) renderStatsCard(retEl, result.countdown,  'countdown');

    } catch (e) {
        console.error('Teaching stats error:', e);
        const errHtml = `<div class="stats-calculating" style="color:var(--neon-pink)">Error: ${e.message}</div>`;
        if (expEl && !expEl.classList.contains('hidden')) expEl.innerHTML = errHtml;
        if (retEl && !retEl.classList.contains('hidden')) retEl.innerHTML = errHtml;
    }
}

function renderStatsCard(el, data, type) {
    const isCountdown  = type === 'countdown';
    const icon         = isCountdown ? '🎓' : '👩‍🏫';
    const titleText    = isCountdown ? 'Until Retirement' : 'Teaching Experience';
    const accent       = isCountdown ? 'var(--neon-pink)' : 'var(--cyan-blue)';

    el.classList.remove('hidden');
    el.innerHTML = `
        <div class="stats-card-title" style="color:${accent}">${icon} ${titleText}</div>
        <div class="stats-grid-4">
            <div class="stats-cell primary">
                <div class="stats-big">${Number(data.totalYears).toLocaleString()}</div>
                <div class="stats-unit">Years</div>
            </div>
            <div class="stats-cell">
                <div class="stats-num">${Number(data.totalMonths).toLocaleString()}</div>
                <div class="stats-unit">School Months</div>
            </div>
            <div class="stats-cell">
                <div class="stats-num">${Number(data.totalWeeks).toLocaleString()}</div>
                <div class="stats-unit">School Weeks</div>
            </div>
            <div class="stats-cell">
                <div class="stats-num">${Number(data.totalDays).toLocaleString()}</div>
                <div class="stats-unit">School Days</div>
            </div>
        </div>
        <div class="stats-message">${data.message || ''}</div>
    `;
}


// ============================================================
// STANDARDS ALIGNMENT (CCSS)
// ============================================================

const CCSS = {
  ela: {
    'RL': {
      label: 'Reading: Literature',
      K: [
        ['CCSS.ELA-LITERACY.RL.K.1','Ask & answer questions about key details.'],
        ['CCSS.ELA-LITERACY.RL.K.2','Retell familiar stories with key details.'],
        ['CCSS.ELA-LITERACY.RL.K.3','Identify characters, settings, and major events.'],
        ['CCSS.ELA-LITERACY.RL.K.4','Ask & answer questions about unknown words.'],
        ['CCSS.ELA-LITERACY.RL.K.5','Recognize common types of texts.'],
        ['CCSS.ELA-LITERACY.RL.K.6','Name the author and illustrator.'],
        ['CCSS.ELA-LITERACY.RL.K.9','Compare & contrast adventures of characters.'],
        ['CCSS.ELA-LITERACY.RL.K.10','Actively engage with group reading.'],
      ],
      '1': [
        ['CCSS.ELA-LITERACY.RL.1.1','Ask & answer questions about key details in a text.'],
        ['CCSS.ELA-LITERACY.RL.1.2','Retell stories including key details; demonstrate understanding of central message.'],
        ['CCSS.ELA-LITERACY.RL.1.3','Describe characters, settings, and major events.'],
        ['CCSS.ELA-LITERACY.RL.1.4','Identify words & phrases that suggest feelings or appeal to senses.'],
        ['CCSS.ELA-LITERACY.RL.1.5','Explain major differences between books that tell stories and books that give information.'],
        ['CCSS.ELA-LITERACY.RL.1.6','Identify who is telling the story at various points.'],
        ['CCSS.ELA-LITERACY.RL.1.7','Use illustrations and details to describe characters, settings, or events.'],
        ['CCSS.ELA-LITERACY.RL.1.9','Compare & contrast adventures of characters in stories.'],
      ],
      '2': [
        ['CCSS.ELA-LITERACY.RL.2.1','Ask & answer such questions as who, what, where, when, why, and how.'],
        ['CCSS.ELA-LITERACY.RL.2.2','Recount stories and determine their central message, lesson, or moral.'],
        ['CCSS.ELA-LITERACY.RL.2.3','Describe how characters respond to major events and challenges.'],
        ['CCSS.ELA-LITERACY.RL.2.5','Describe the overall structure of a story.'],
        ['CCSS.ELA-LITERACY.RL.2.6','Acknowledge differences in the points of view of characters.'],
        ['CCSS.ELA-LITERACY.RL.2.9','Compare & contrast two or more versions of the same story.'],
      ],
      '3': [
        ['CCSS.ELA-LITERACY.RL.3.1','Ask & answer questions to demonstrate understanding.'],
        ['CCSS.ELA-LITERACY.RL.3.2','Recount stories and determine the central message.'],
        ['CCSS.ELA-LITERACY.RL.3.3','Describe characters and explain how their actions contribute to the plot.'],
        ['CCSS.ELA-LITERACY.RL.3.5','Refer to parts of stories, dramas, and poems.'],
        ['CCSS.ELA-LITERACY.RL.3.6','Distinguish own point of view from narrator or characters.'],
      ],
    },
    'RI': {
      label: 'Reading: Informational Text',
      K: [
        ['CCSS.ELA-LITERACY.RI.K.1','Ask & answer questions about key details.'],
        ['CCSS.ELA-LITERACY.RI.K.2','Identify the main topic & retell key details.'],
        ['CCSS.ELA-LITERACY.RI.K.3','Describe the connection between two individuals, events, ideas, or pieces of information.'],
        ['CCSS.ELA-LITERACY.RI.K.7','Describe the relationship between illustrations and the text.'],
      ],
      '1': [
        ['CCSS.ELA-LITERACY.RI.1.1','Ask & answer questions about key details in a text.'],
        ['CCSS.ELA-LITERACY.RI.1.2','Identify the main topic & retell key details.'],
        ['CCSS.ELA-LITERACY.RI.1.3','Describe the connection between two individuals, events, ideas, or pieces of information.'],
        ['CCSS.ELA-LITERACY.RI.1.4','Ask & answer questions about unknown words.'],
        ['CCSS.ELA-LITERACY.RI.1.5','Know and use various text features.'],
        ['CCSS.ELA-LITERACY.RI.1.6','Distinguish between information provided by pictures or other illustrations and text.'],
        ['CCSS.ELA-LITERACY.RI.1.7','Use illustrations and details to describe key ideas.'],
        ['CCSS.ELA-LITERACY.RI.1.8','Identify the reasons an author gives to support points.'],
        ['CCSS.ELA-LITERACY.RI.1.9','Identify basic similarities & differences between two texts on the same topic.'],
      ],
      '2': [
        ['CCSS.ELA-LITERACY.RI.2.1','Ask & answer such questions as who, what, where, when, why, and how.'],
        ['CCSS.ELA-LITERACY.RI.2.2','Identify the main topic of a multi-paragraph text.'],
        ['CCSS.ELA-LITERACY.RI.2.3','Describe the connection between a series of historical events, concepts, or steps.'],
        ['CCSS.ELA-LITERACY.RI.2.5','Know and use various text features.'],
        ['CCSS.ELA-LITERACY.RI.2.6','Identify the main purpose of a text.'],
        ['CCSS.ELA-LITERACY.RI.2.8','Describe how reasons support specific points the author makes.'],
      ],
      '3': [
        ['CCSS.ELA-LITERACY.RI.3.1','Ask & answer questions to demonstrate understanding.'],
        ['CCSS.ELA-LITERACY.RI.3.2','Determine the main idea; recount key details.'],
        ['CCSS.ELA-LITERACY.RI.3.3','Describe the relationship between a series of historical events, steps in technical procedures, or concepts.'],
        ['CCSS.ELA-LITERACY.RI.3.5','Use text features and search tools to locate information.'],
        ['CCSS.ELA-LITERACY.RI.3.8','Describe the logical connection between sentences and paragraphs.'],
      ],
    },
    'RF': {
      label: 'Reading: Foundational Skills',
      K: [
        ['CCSS.ELA-LITERACY.RF.K.1','Demonstrate understanding of print concepts.'],
        ['CCSS.ELA-LITERACY.RF.K.2','Demonstrate understanding of spoken words, syllables, and sounds.'],
        ['CCSS.ELA-LITERACY.RF.K.3','Know and apply grade-level phonics and word analysis skills.'],
        ['CCSS.ELA-LITERACY.RF.K.4','Read emergent-reader texts with purpose and understanding.'],
      ],
      '1': [
        ['CCSS.ELA-LITERACY.RF.1.1','Demonstrate understanding of the organization and basic features of print.'],
        ['CCSS.ELA-LITERACY.RF.1.2','Demonstrate understanding of spoken words, syllables, and sounds (phonemes).'],
        ['CCSS.ELA-LITERACY.RF.1.3.A','Know the spelling-sound correspondences for common consonant digraphs.'],
        ['CCSS.ELA-LITERACY.RF.1.3.B','Decode regularly spelled one-syllable words.'],
        ['CCSS.ELA-LITERACY.RF.1.3.C','Know final -e and common vowel team conventions for long vowel sounds.'],
        ['CCSS.ELA-LITERACY.RF.1.3.D','Use knowledge that every syllable must have a vowel sound.'],
        ['CCSS.ELA-LITERACY.RF.1.3.E','Decode two-syllable words following basic patterns.'],
        ['CCSS.ELA-LITERACY.RF.1.3.F','Read words with inflectional endings.'],
        ['CCSS.ELA-LITERACY.RF.1.3.G','Recognize and read grade-appropriate irregularly spelled words.'],
        ['CCSS.ELA-LITERACY.RF.1.4.A','Read on-level text with purpose and understanding.'],
        ['CCSS.ELA-LITERACY.RF.1.4.B','Read on-level text orally with accuracy, appropriate rate, and expression.'],
        ['CCSS.ELA-LITERACY.RF.1.4.C','Use context to confirm or self-correct word recognition and understanding.'],
      ],
      '2': [
        ['CCSS.ELA-LITERACY.RF.2.3','Know and apply grade-level phonics and word analysis skills.'],
        ['CCSS.ELA-LITERACY.RF.2.3.A','Distinguish long and short vowels when reading one-syllable words.'],
        ['CCSS.ELA-LITERACY.RF.2.3.B','Know spelling-sound correspondences for additional common vowel teams.'],
        ['CCSS.ELA-LITERACY.RF.2.4','Read with sufficient accuracy and fluency to support comprehension.'],
      ],
      '3': [
        ['CCSS.ELA-LITERACY.RF.3.3','Know and apply grade-level phonics and word analysis skills in decoding words.'],
        ['CCSS.ELA-LITERACY.RF.3.4','Read with sufficient accuracy and fluency to support comprehension.'],
      ],
    },
    'W': {
      label: 'Writing',
      K: [
        ['CCSS.ELA-LITERACY.W.K.1','Use drawing, dictating, and writing to compose opinion pieces.'],
        ['CCSS.ELA-LITERACY.W.K.2','Use drawing, dictating, and writing to compose informative/explanatory texts.'],
        ['CCSS.ELA-LITERACY.W.K.3','Use drawing, dictating, and writing to narrate a single event.'],
        ['CCSS.ELA-LITERACY.W.K.5','Respond to questions and suggestions from peers and add details.'],
        ['CCSS.ELA-LITERACY.W.K.7','Participate in shared research and writing projects.'],
      ],
      '1': [
        ['CCSS.ELA-LITERACY.W.1.1','Write opinion pieces naming a topic, stating an opinion, and supplying a reason.'],
        ['CCSS.ELA-LITERACY.W.1.2','Write informative/explanatory texts that name a topic and supply facts.'],
        ['CCSS.ELA-LITERACY.W.1.3','Write narratives recounting two or more appropriately sequenced events.'],
        ['CCSS.ELA-LITERACY.W.1.5','Focus on a topic, respond to questions and suggestions from peers, and add details to strengthen writing.'],
        ['CCSS.ELA-LITERACY.W.1.6','Use digital tools to produce and publish writing.'],
        ['CCSS.ELA-LITERACY.W.1.7','Participate in shared research and writing projects.'],
        ['CCSS.ELA-LITERACY.W.1.8','Recall information from experiences or gather information to answer a question.'],
      ],
      '2': [
        ['CCSS.ELA-LITERACY.W.2.1','Write opinion pieces introducing a topic, state an opinion, supply reasons.'],
        ['CCSS.ELA-LITERACY.W.2.2','Write informative/explanatory texts introducing a topic, using facts and definitions.'],
        ['CCSS.ELA-LITERACY.W.2.3','Write narratives recounting a short sequence of events.'],
        ['CCSS.ELA-LITERACY.W.2.5','Focus on a topic and strengthen writing as needed by revising and editing.'],
      ],
      '3': [
        ['CCSS.ELA-LITERACY.W.3.1','Write opinion pieces on topics or texts, supporting a point of view.'],
        ['CCSS.ELA-LITERACY.W.3.2','Write informative/explanatory texts to examine a topic and convey ideas.'],
        ['CCSS.ELA-LITERACY.W.3.3','Write narratives to develop real or imagined experiences.'],
      ],
    },
    'L': {
      label: 'Language',
      K: [
        ['CCSS.ELA-LITERACY.L.K.1','Demonstrate command of grammar conventions.'],
        ['CCSS.ELA-LITERACY.L.K.2','Demonstrate command of capitalization, punctuation, and spelling.'],
        ['CCSS.ELA-LITERACY.L.K.4','Determine or clarify the meaning of unknown words.'],
        ['CCSS.ELA-LITERACY.L.K.6','Use words and phrases acquired through conversations and reading.'],
      ],
      '1': [
        ['CCSS.ELA-LITERACY.L.1.1.A','Print all upper- and lowercase letters.'],
        ['CCSS.ELA-LITERACY.L.1.1.B','Use common, proper, and possessive nouns.'],
        ['CCSS.ELA-LITERACY.L.1.1.C','Use singular and plural nouns with matching verbs in basic sentences.'],
        ['CCSS.ELA-LITERACY.L.1.1.D','Use personal, possessive, and indefinite pronouns.'],
        ['CCSS.ELA-LITERACY.L.1.1.E','Use verbs to convey a sense of past, present, and future.'],
        ['CCSS.ELA-LITERACY.L.1.1.F','Use frequently occurring adjectives.'],
        ['CCSS.ELA-LITERACY.L.1.1.G','Use frequently occurring conjunctions.'],
        ['CCSS.ELA-LITERACY.L.1.1.H','Use determiners (articles, demonstratives).'],
        ['CCSS.ELA-LITERACY.L.1.1.J','Produce and expand complete simple and compound declarative, interrogative, imperative, and exclamatory sentences.'],
        ['CCSS.ELA-LITERACY.L.1.2.A','Capitalize dates and names of people.'],
        ['CCSS.ELA-LITERACY.L.1.2.B','Use end punctuation for sentences.'],
        ['CCSS.ELA-LITERACY.L.1.2.C','Use commas in dates and to separate single words in a series.'],
        ['CCSS.ELA-LITERACY.L.1.2.D','Use conventional spelling for words with common spelling patterns.'],
        ['CCSS.ELA-LITERACY.L.1.4.A','Use sentence-level context as a clue to the meaning of a word.'],
        ['CCSS.ELA-LITERACY.L.1.5.A','Sort words into categories.'],
        ['CCSS.ELA-LITERACY.L.1.5.D','Distinguish shades of meaning among verbs.'],
        ['CCSS.ELA-LITERACY.L.1.6','Use words and phrases acquired through conversations and reading.'],
      ],
      '2': [
        ['CCSS.ELA-LITERACY.L.2.1','Demonstrate command of grammar and usage.'],
        ['CCSS.ELA-LITERACY.L.2.2','Demonstrate command of capitalization, punctuation, and spelling.'],
        ['CCSS.ELA-LITERACY.L.2.4','Determine or clarify the meaning of unknown and multiple-meaning words and phrases.'],
        ['CCSS.ELA-LITERACY.L.2.6','Use words and phrases acquired through conversations, reading, and being read to.'],
      ],
      '3': [
        ['CCSS.ELA-LITERACY.L.3.1','Demonstrate command of grammar and usage.'],
        ['CCSS.ELA-LITERACY.L.3.2','Demonstrate command of capitalization, punctuation, and spelling.'],
        ['CCSS.ELA-LITERACY.L.3.4','Determine or clarify the meaning of unknown words.'],
      ],
    },
  },
  math: {
    'OA': {
      label: 'Operations & Algebraic Thinking',
      K: [
        ['CCSS.MATH.CONTENT.K.OA.A.1','Represent addition and subtraction with objects, fingers, mental images.'],
        ['CCSS.MATH.CONTENT.K.OA.A.2','Solve addition and subtraction word problems within 10.'],
        ['CCSS.MATH.CONTENT.K.OA.A.3','Decompose numbers less than or equal to 10 into pairs.'],
        ['CCSS.MATH.CONTENT.K.OA.A.4','Find the number that makes 10 when added to a given number.'],
        ['CCSS.MATH.CONTENT.K.OA.A.5','Fluently add and subtract within 5.'],
      ],
      '1': [
        ['CCSS.MATH.CONTENT.1.OA.A.1','Use addition and subtraction within 20 to solve word problems.'],
        ['CCSS.MATH.CONTENT.1.OA.A.2','Solve word problems that call for addition of three whole numbers.'],
        ['CCSS.MATH.CONTENT.1.OA.B.3','Apply properties of operations as strategies to add and subtract.'],
        ['CCSS.MATH.CONTENT.1.OA.B.4','Understand subtraction as an unknown-addend problem.'],
        ['CCSS.MATH.CONTENT.1.OA.C.5','Relate counting to addition and subtraction.'],
        ['CCSS.MATH.CONTENT.1.OA.C.6','Add and subtract within 20, demonstrating fluency within 10.'],
        ['CCSS.MATH.CONTENT.1.OA.D.7','Understand the meaning of the equal sign.'],
        ['CCSS.MATH.CONTENT.1.OA.D.8','Determine the unknown whole number in an addition or subtraction equation.'],
      ],
      '2': [
        ['CCSS.MATH.CONTENT.2.OA.A.1','Use addition and subtraction within 100 to solve word problems.'],
        ['CCSS.MATH.CONTENT.2.OA.B.2','Fluently add and subtract within 20.'],
        ['CCSS.MATH.CONTENT.2.OA.C.3','Determine whether a group of objects has an odd or even number of members.'],
        ['CCSS.MATH.CONTENT.2.OA.C.4','Use addition to find the total number of objects arranged in arrays.'],
      ],
      '3': [
        ['CCSS.MATH.CONTENT.3.OA.A.1','Interpret products of whole numbers.'],
        ['CCSS.MATH.CONTENT.3.OA.A.2','Interpret whole-number quotients of whole numbers.'],
        ['CCSS.MATH.CONTENT.3.OA.A.3','Use multiplication and division within 100 to solve word problems.'],
        ['CCSS.MATH.CONTENT.3.OA.A.4','Determine the unknown whole number in a multiplication or division equation.'],
        ['CCSS.MATH.CONTENT.3.OA.B.5','Apply properties of operations as strategies to multiply and divide.'],
        ['CCSS.MATH.CONTENT.3.OA.C.7','Fluently multiply and divide within 100.'],
        ['CCSS.MATH.CONTENT.3.OA.D.8','Solve two-step word problems using the four operations.'],
      ],
    },
    'NBT': {
      label: 'Number & Operations in Base Ten',
      K: [
        ['CCSS.MATH.CONTENT.K.NBT.A.1','Compose and decompose numbers from 11 to 19 into ten ones and some further ones.'],
      ],
      '1': [
        ['CCSS.MATH.CONTENT.1.NBT.A.1','Count to 120, starting at any number less than 120.'],
        ['CCSS.MATH.CONTENT.1.NBT.B.2','Understand that the two digits of a two-digit number represent tens and ones.'],
        ['CCSS.MATH.CONTENT.1.NBT.B.3','Compare two two-digit numbers based on tens and ones.'],
        ['CCSS.MATH.CONTENT.1.NBT.C.4','Add within 100, using concrete models or drawings and strategies.'],
        ['CCSS.MATH.CONTENT.1.NBT.C.5','Given a two-digit number, mentally find 10 more or 10 less.'],
        ['CCSS.MATH.CONTENT.1.NBT.C.6','Subtract multiples of 10 in the range 10–90.'],
      ],
      '2': [
        ['CCSS.MATH.CONTENT.2.NBT.A.1','Understand that the three digits of a three-digit number represent hundreds, tens, and ones.'],
        ['CCSS.MATH.CONTENT.2.NBT.A.2','Count within 1000; skip-count by 5s, 10s, and 100s.'],
        ['CCSS.MATH.CONTENT.2.NBT.A.3','Read and write numbers to 1000.'],
        ['CCSS.MATH.CONTENT.2.NBT.A.4','Compare two three-digit numbers.'],
        ['CCSS.MATH.CONTENT.2.NBT.B.5','Fluently add and subtract within 100.'],
        ['CCSS.MATH.CONTENT.2.NBT.B.7','Add and subtract within 1000.'],
      ],
      '3': [
        ['CCSS.MATH.CONTENT.3.NBT.A.1','Use place value understanding to round whole numbers to the nearest 10 or 100.'],
        ['CCSS.MATH.CONTENT.3.NBT.A.2','Fluently add and subtract within 1000.'],
        ['CCSS.MATH.CONTENT.3.NBT.A.3','Multiply one-digit whole numbers by multiples of 10.'],
      ],
    },
    'MD': {
      label: 'Measurement & Data',
      K: [
        ['CCSS.MATH.CONTENT.K.MD.A.1','Describe measurable attributes of objects.'],
        ['CCSS.MATH.CONTENT.K.MD.A.2','Directly compare two objects with a measurable attribute in common.'],
        ['CCSS.MATH.CONTENT.K.MD.B.3','Classify objects into given categories; count the numbers in each category.'],
      ],
      '1': [
        ['CCSS.MATH.CONTENT.1.MD.A.1','Order three objects by length; compare the lengths of two objects indirectly.'],
        ['CCSS.MATH.CONTENT.1.MD.A.2','Express the length of an object as a whole number of length units.'],
        ['CCSS.MATH.CONTENT.1.MD.B.3','Tell and write time in hours and half-hours using analog and digital clocks.'],
        ['CCSS.MATH.CONTENT.1.MD.C.4','Organize, represent, and interpret data with up to three categories.'],
      ],
      '2': [
        ['CCSS.MATH.CONTENT.2.MD.A.1','Measure the length of an object by selecting and using appropriate tools.'],
        ['CCSS.MATH.CONTENT.2.MD.A.3','Estimate lengths using units of inches, feet, centimeters, and meters.'],
        ['CCSS.MATH.CONTENT.2.MD.B.5','Use addition and subtraction within 100 to solve measurement problems.'],
        ['CCSS.MATH.CONTENT.2.MD.C.7','Tell and write time from analog and digital clocks to the nearest five minutes.'],
        ['CCSS.MATH.CONTENT.2.MD.C.8','Solve word problems involving dollar bills, quarters, dimes, nickels, and pennies.'],
        ['CCSS.MATH.CONTENT.2.MD.D.9','Generate measurement data and show data on a line plot.'],
        ['CCSS.MATH.CONTENT.2.MD.D.10','Draw a picture graph and a bar graph.'],
      ],
      '3': [
        ['CCSS.MATH.CONTENT.3.MD.A.1','Tell and write time to the nearest minute.'],
        ['CCSS.MATH.CONTENT.3.MD.A.2','Measure and estimate liquid volumes and masses.'],
        ['CCSS.MATH.CONTENT.3.MD.B.3','Draw a scaled picture graph and a scaled bar graph.'],
        ['CCSS.MATH.CONTENT.3.MD.C.5','Recognize area as an attribute of plane figures.'],
        ['CCSS.MATH.CONTENT.3.MD.C.7','Relate area to the operations of multiplication and addition.'],
      ],
    },
    'G': {
      label: 'Geometry',
      K: [
        ['CCSS.MATH.CONTENT.K.G.A.1','Describe objects in the environment using names of shapes.'],
        ['CCSS.MATH.CONTENT.K.G.A.2','Correctly name shapes regardless of their orientations or overall size.'],
        ['CCSS.MATH.CONTENT.K.G.A.3','Identify shapes as two-dimensional or three-dimensional.'],
        ['CCSS.MATH.CONTENT.K.G.B.4','Analyze and compare two- and three-dimensional shapes.'],
        ['CCSS.MATH.CONTENT.K.G.B.5','Model shapes in the world by building shapes from components.'],
        ['CCSS.MATH.CONTENT.K.G.B.6','Compose simple shapes to form larger shapes.'],
      ],
      '1': [
        ['CCSS.MATH.CONTENT.1.G.A.1','Distinguish between defining attributes vs. non-defining attributes.'],
        ['CCSS.MATH.CONTENT.1.G.A.2','Compose two-dimensional shapes or three-dimensional shapes to create a composite shape.'],
        ['CCSS.MATH.CONTENT.1.G.A.3','Partition circles and rectangles into two and four equal shares.'],
      ],
      '2': [
        ['CCSS.MATH.CONTENT.2.G.A.1','Recognize and draw shapes having specified attributes.'],
        ['CCSS.MATH.CONTENT.2.G.A.2','Partition a rectangle into rows and columns of same-size squares.'],
        ['CCSS.MATH.CONTENT.2.G.A.3','Partition circles and rectangles into two, three, or four equal shares.'],
      ],
      '3': [
        ['CCSS.MATH.CONTENT.3.G.A.1','Understand that shapes in different categories may share attributes.'],
        ['CCSS.MATH.CONTENT.3.G.A.2','Partition shapes into parts with equal areas.'],
      ],
    },
  },
  science: {
    'PS': {
      label: 'Physical Science',
      K: [
        ['NGSS K-PS2-1','Plan and conduct an investigation to compare the effects of different strengths or different directions of pushes and pulls.'],
        ['NGSS K-PS2-2','Analyze data to determine if a design solution works as intended to change the speed or direction of an object.'],
        ['NGSS K-PS3-1','Make observations to determine the effect of sunlight on Earth\'s surface.'],
      ],
      '1': [
        ['NGSS 1-PS4-1','Plan and conduct investigations to provide evidence that vibrating materials can make sound.'],
        ['NGSS 1-PS4-2','Make observations to construct an evidence-based account that objects can be seen only when illuminated.'],
        ['NGSS 1-PS4-3','Plan and conduct investigations to determine the effect of placing objects made with different materials in the path of a beam of light.'],
        ['NGSS 1-PS4-4','Use tools and materials to design and build a device that uses light or sound to solve the problem of communicating over a distance.'],
      ],
      '2': [
        ['NGSS 2-PS1-1','Plan and conduct an investigation to describe and classify different kinds of materials by their observable properties.'],
        ['NGSS 2-PS1-2','Analyze data obtained from testing different materials to determine which materials have the properties that are best suited for an intended purpose.'],
        ['NGSS 2-PS1-3','Make observations to construct an evidence-based account of how an object made of a small set of pieces can be disassembled and made into a new object.'],
      ],
      '3': [
        ['NGSS 3-PS2-1','Plan and conduct an investigation to provide evidence of the effects of balanced and unbalanced forces on the motion of an object.'],
        ['NGSS 3-PS2-3','Ask questions to determine cause and effect relationships of electric or magnetic interactions.'],
      ],
    },
    'LS': {
      label: 'Life Science',
      K: [
        ['NGSS K-LS1-1','Use observations to describe patterns of what plants and animals (including humans) need to survive.'],
      ],
      '1': [
        ['NGSS 1-LS1-1','Use materials to design a solution to a human problem by mimicking how plants and/or animals use their external parts to help them survive.'],
        ['NGSS 1-LS1-2','Read texts and use media to determine patterns in behavior of parents and offspring that help offspring survive.'],
        ['NGSS 1-LS3-1','Make observations to construct an evidence-based account that young plants and animals are like, but not exactly like, their parents.'],
      ],
      '2': [
        ['NGSS 2-LS2-1','Plan and conduct an investigation to determine if plants need sunlight and water to grow.'],
        ['NGSS 2-LS2-2','Develop a simple model that mimics the function of an animal in dispersing seeds or pollinating plants.'],
        ['NGSS 2-LS4-1','Make observations of plants and animals to compare the diversity of life in different habitats.'],
      ],
      '3': [
        ['NGSS 3-LS1-1','Develop models to describe that organisms have unique and diverse life cycles.'],
        ['NGSS 3-LS2-1','Construct an argument that some animals form groups that help members survive.'],
        ['NGSS 3-LS3-1','Analyze and interpret data to provide evidence that plants and animals have traits inherited from parents.'],
        ['NGSS 3-LS4-2','Use evidence to construct an explanation for how the variations in characteristics among individuals of the same species may provide advantages.'],
      ],
    },
    'ESS': {
      label: 'Earth & Space Science',
      K: [
        ['NGSS K-ESS2-1','Use and share observations of local weather conditions to describe patterns over time.'],
        ['NGSS K-ESS3-1','Use a model to represent the relationship between the needs of different plants or animals and the places they live.'],
      ],
      '1': [
        ['NGSS 1-ESS1-1','Use observations of the sun, moon, and stars to describe patterns that can be predicted.'],
        ['NGSS 1-ESS1-2','Make observations at different times of year to relate the amount of daylight to the time of year.'],
      ],
      '2': [
        ['NGSS 2-ESS1-1','Use information from several sources to provide evidence that Earth events can occur quickly or slowly.'],
        ['NGSS 2-ESS2-1','Compare multiple solutions designed to slow or prevent wind or water from changing the shape of the land.'],
        ['NGSS 2-ESS2-2','Develop a model to represent the shapes and kinds of land and bodies of water in an area.'],
      ],
      '3': [
        ['NGSS 3-ESS2-1','Represent data in tables and graphical displays to describe typical weather conditions expected during a particular season.'],
        ['NGSS 3-ESS2-2','Obtain and combine information to describe climates in different regions of the world.'],
      ],
    },
  },
};

