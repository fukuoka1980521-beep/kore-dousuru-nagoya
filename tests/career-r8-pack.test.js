global.window = global;
require("../src/app/assist/career-r8.js");
const result = global.CareerUpR8Pack.selfTest();
console.log(JSON.stringify(result, null, 2));
if (result.pass !== result.total) {
  process.exitCode = 1;
}

// trigger-v1
