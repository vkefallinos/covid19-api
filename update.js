const fs = require("fs");
const path = require("path");
const parse = require("csv-parse/lib/sync");

const FILENAME_CONFIRMED = "time_series_covid19_confirmed_global.csv";
const FILENAME_DEATHS = "time_series_covid19_deaths_global.csv";
const FILENAME_RECOVERED = "time_series_covid19_recovered_global.csv";
const FILENAME_TESTS = "covid-testing-all-observations.csv";

function extractTests(filepath, countries) {
  const csv = fs.readFileSync(filepath);
  const data = parse(csv);
  // console.log(data)
  const timeseriesPerEntity = data.reduce((perCountry, entry)=>{
    const [ientity, date, source, sourceLabel,notes, testsTotal] = entry
    const entity = ientity.split("-")[0]
    if(!perCountry[entity]){
      perCountry[entity] = {}
    }
    const normalDate = new Date(date)
    perCountry[entity][`${normalDate.getFullYear()}-${normalDate.getMonth()+1}-${normalDate.getDate()}`] = parseInt(testsTotal)
    return perCountry
  }, {})
  const timeseriesPerCountry = {}
  timeseriesPerEntity["Czechia"] = timeseriesPerEntity["Czech Republic "]
  delete timeseriesPerEntity["Czech Republic "]
  for(const entity in timeseriesPerEntity){
    const countryName = countries.find((country)=>{
      return entity.match(country)
    })
    if(!countryName){
      console.error( entity)
    }
    timeseriesPerCountry[countryName] = timeseriesPerEntity[entity]
  }
  return [timeseriesPerCountry]

}

function extract(filepath) {
  const csv = fs.readFileSync(filepath);
  const [headers, ...rows] = parse(csv);
  let [province, country, lat, long, ...dates] = headers;
  const countList = {};

  // HACK: CSVs have different date formats
  const normalDates = dates.map(date => {
    const [month, day] = date.split("/");
    return `2020-${month}-${day}`;
  });

  rows.forEach(([province, country, lat, long, ...counts]) => {
    if(country.includes(",")){
      const [part1, part2] = country.split(",")
      country = `${part2.trim()} ${part1.trim()}`
    }
    countList[country] = countList[country] || {};
    normalDates.forEach((date, i) => {
      countList[country][date] = countList[country][date] || 0;
      countList[country][date] += +counts[i];
    });
  });
  // console.log(countList)
  return [countList, normalDates];
}

// HACK: Now all the names are the same, but leaving this just in case
const patchCountryNames = {};

function update(dataPath, outputPath) {
  const [confirmed, dates] = extract(
    path.resolve(dataPath, FILENAME_CONFIRMED)
  );
  const [deaths] = extract(path.resolve(dataPath, FILENAME_DEATHS));
  const [recovered] = extract(path.resolve(dataPath, FILENAME_RECOVERED));
  const countries = Object.keys(confirmed);
  const [tests] = extractTests(path.resolve(dataPath, FILENAME_TESTS), countries);
  const results = {};
  console.log(tests["Greece"])
  countries.forEach(country => {
    // Some country names are different in the recovered dataset
    const recoverdCountry = patchCountryNames[country] || country;

    if (!recovered[recoverdCountry]) {
      console.warn(`${recoverdCountry} is missing from the recovered dataset`);
    }
    let lastTests = 0
    results[country] = dates.map(date => {
      const totalTests = tests[country] && tests[country][date] || lastTests
      lastTests = totalTests
      return {
        date,
        confirmed: confirmed[country][date],
        deaths: deaths[country][date],
        tests: totalTests,
        recovered:
          recovered[recoverdCountry] && recovered[recoverdCountry][date] != null
            ? recovered[recoverdCountry][date]
            : null
      };
    });
  });

  fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));
}

module.exports = update;
