import ProgVis from "./progvis";

async function main() {
  // get a list of items to process
  const things = await getLotsOfThings();

  // construct a ProgVis instance and give it a unique stable name,
  const pv = new ProgVis("process-things", things.length);

  // iterate over and process your things
  while (things.length) {
    const thing = things.shift();
    const result = await process(thing);
    pv.step();
    pv.log({ thing, result });
  }

  pv.done(); // or pv.error() to indicate job failure
}

main();

// async return an array of numbers after a delay
async function getLotsOfThings() {
  const list = Array.from({ length: 40 }, () => Math.floor(Math.random() * 40));
  return new Promise(resolve => {
    setTimeout(() => resolve(list), 1000);
  });
}

// async return number x 2 after a random delay
async function process(number) {
  return new Promise(resolve => {
    setTimeout(() => number * 2, 100 + Math.random() * 1000);
  });
}
