const log = require('fancy-log');
const sqlite3 = require('sqlite3');
const fs = require('fs');
const tail = require('tail').Tail;
const clipboardy = require('clipboardy');
const beep = require('beepbeep');

log.info('Starting quizzer');

let lastQuestion = '';
let lastQuestionAnswered = false;

if (process.argv.length > 2) {
  const db = new sqlite3.Database('db/quiz.db', (err) => {
    if (err) {
      log.error(err);
      process.exit(1);
    }
    log.info('Connected to db');
    (async () => {
      const file = fs.readFileSync(process.argv[2], { encoding: 'utf8' });
      const lines = file.split(/\r{0,1}\n/);
      for (let i = 0; i < lines.length; i++) {
        const parsedLine = lines[i].match(/^.*\[CHAT\] \[Quiz\] (.*$)/);
        if (!parsedLine || parsedLine.length < 2) {
          continue;
        }
        const quizSentece = parsedLine[1];
        const answer = isAnswer(quizSentece);
  
        // Ignore if we start the program and a question was asked before
        if (!lastQuestion && answer) {
          return;
        }
        if (answer && !lastQuestionAnswered) {
          log.info(`Answer to ${lastQuestion} was: ${answer}`);
          insertQuestionAnswer(lastQuestion, answer);
          log.info('Answer has been added to db');
          lastQuestion = '';
          continue;
        }
        const word = solveTypingQuestion(quizSentece);
        if (word) {
          log.info(`/answ ${word}`);
        }
        log.info(`Question: ${quizSentece}`);
        const foundAnswer = await findAnswer(quizSentece);
        if (!foundAnswer) {
          log.info('Answer unknown');
          lastQuestion = quizSentece;
          lastQuestionAnswered = false;
          continue;
        } else {
          log.info(`/answ ${foundAnswer.answer}`);
          incrementOccurences(quizSentece);
          lastQuestionAnswered = true;
        }
        lastQuestion = quizSentece;
        continue;
      }
      process.exit(0);
    })();
  });
}


const db = new sqlite3.Database('db/quiz.db', (err) => {
  if (err) {
    log.error(err);
    process.exit(1);
  }
  log.info('Connected to db');
});

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS quiz_questions (
      question TEXT CHECK(question IS NOT NULL AND length(question) > 0) UNIQUE,
      answer TEXT NOT NULL,
      occurrence INTEGER DEFAULT 1
    );
  `);
});

function insertQuestionAnswer(question, answer) {
  const insertStatement = db.prepare('INSERT INTO quiz_questions (question, answer) VALUES (?, ?)');
  insertStatement.run(question, answer, (err) => {
    if (err) {
      log.error(err);
    }
  });
  insertStatement.finalize();
}

function incrementOccurences(question) {
  const updateStatement = db.prepare('UPDATE quiz_questions SET occurrence = occurrence + 1 WHERE question = ?');
  updateStatement.run(question);
  updateStatement.finalize();
}

function findAnswer(question) {
  return new Promise((resolve, reject) => {
    db.get('SELECT answer FROM quiz_questions WHERE question = ?', [question], (err, row) => {
      if (err) {
        reject(err);
      }
      resolve(row);
    });
  });
}


logFile = new tail(`${process.env.APPDATA}\\.minecraft\\logs\\latest.log`, { fsWatchOptions: { interval: 100 }, logger: log, useWatchFile: true });

function solveTypingQuestion(input) {
  const word = input.match(/^Type \"(.*)\" first to win! Use \/answer to answer the question!$/);
  if (word && word.length > 1) {
    return word[1];
  }
  return '';
}

function solveEquation(input) {
  const equation = input.match(/^Solve ([0-9*+-/]+) first to get a reward! Use \/answer to answer the question!$/);
  if (equation && equation.length > 1) {
    return eval(equation[1]);
  }
  return '';
}

function isAnswer(input) {
  const answer = input.match(/^\w+ wins after \d+\.\d+ sec! Answer was: (.*)$/);
  if (answer && answer.length > 1) {
    return answer[1];
  }
  const failedAnswer = input.match(/Time for answer ended. Correct answer was: (.*)/);
  if (failedAnswer && failedAnswer.length > 1) {
    return failedAnswer[1];
  }
  return '';
}

logFile.on('line', async (data) => {
  const parsedLine = data.match(/^.*\[CHAT\] \[Quiz\] (.*$)/);
  if (!parsedLine || parsedLine.length < 2) {
    return;
  }
  const quizSentece = parsedLine[1];
  const answer = isAnswer(quizSentece);
  
  // Ignore if we start the program and a question was asked before
  if (!lastQuestion && answer) {
    return;
  }
  if (answer && !lastQuestionAnswered) {
    log.info(`Answer to ${lastQuestion} was: ${answer}`);
    insertQuestionAnswer(lastQuestion, answer);
    log.info('Answer has been added to db');
    lastQuestion = '';
    return;
  }
  const word = solveTypingQuestion(quizSentece);
  if (word) {
    log.info(`/answ ${word}`);
    clipboardy.writeSync(`/answ ${word}`);
    beep(2);
  }
  const equationAnswer = solveEquation(quizSentece);
  if (equationAnswer) {
    log.info(`/answ ${equationAnswer}`);
    clipboardy.writeSync(`/answ ${equationAnswer}`);
    beep(2);
  }
  const foundAnswer = await findAnswer(quizSentece);
  if (!foundAnswer) {
    log.info('Answer unknown');
    lastQuestionAnswered = false;
  } else {
    log.info(`/answ ${foundAnswer.answer}`);
    clipboardy.writeSync(`/answ ${foundAnswer.answer}`);
    beep(2);
    incrementOccurences(quizSentece);
    lastQuestionAnswered = true;
  }
  lastQuestion = quizSentece;
});