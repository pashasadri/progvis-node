import ProgVis from "progvis";

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
