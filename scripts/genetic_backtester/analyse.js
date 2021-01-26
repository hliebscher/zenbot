// Used with https://github.com/DeviaVir/zenbot
// I store this file at zenbot\scripts\genetic_backtester\summarize.js
// Example usage:
// node scripts\genetic_backtester\summarize.js --population_data simulations/popDataFolder --count 5 --prop endBalance --gen 1

const fs = require('fs'),
  KEY_POP_DATA = 'population_data',
  KEY_BT_GEN = 'backtester_generation',
  KEY_STRAT = 'strategy',
  KEY_FITNESS = 'fitness',
  IS_MAC_OS = process.platform === 'darwin',
  IS_WIN_OS = process.platform === 'win32',
  opts = {
    string: ['population_data', 'prop', 'count', 'gen', 'props', 'sim', 'cmd'],
    boolean: ['help', 'strats'],
    alias: {
      p: 'population_data',
      folder: 'population_data',
      c: 'count',
      g: 'gen',
      s: 'sim'
    },
    population_data: {
      desc: 'Path to the gen_X folders',
      required: true
    },
    count: {
      desc: 'How many results to show for each strategy and in total',
      default: 5
    },
    prop: {
      desc:
        'The property to sort results by in the sim_X.json file (i.e.  endBalance).  Can be calculated prop fitness.',
      default: 'fitness'
    },
    props: {
      desc: 'Comma separated list of properties to show (i.e. roi,wlRatio,vsBuyHold)',
      default: ''
    },
    gen: {
      desc: 'The number of the gen_X folder to use (for gen_0, --gen 0)',
      default: 0
    },
    sim: {
      desc:
        "Run commandString from this file (sim_X.json or just the number X). Currently only works on Windows os.  Removes '--filename=none'"
    },
    cmd: {
      desc: 'Show the commandString from this file (sim_X.json or just the number X)'
    },
    strats: {
      desc: "Show list of all strats in 'totals' section ",
      default: false
    },
    float_precision: {
      desc: 'How many digits to show after decimal for floating point numbers',
      default: 2
    },
    help: {
      desc: 'Show help message',
      default: false,
      banner:
        "For use with zenbot's genetic backtester: darwin. \nDisplays the top N results from sim files for a given generation.  Results sorted by --prop, grouped by strategy and in total." +
        '\n\nExample Usage: \n  >node scripts/genetic_backtester/summarize.js --p simulations/populationDataFolder --g 1 --prop vsBuyHold --props wlRatio,fitness,endBalance --count 5'
    },
    hidden_props: ['string', 'boolean', 'help', 'hidden_props', 'alias']
  },
  argv = require('minimist')(process.argv.slice(2), opts)

// Set defaults, display
console.log('')
let argsDisplay = visibleOpts()
  .map(k => {
    if (!argv[k] && argv[k] !== 0 && opts[k].default !== null) {
      argv[k] = opts[k].default
    }
    return argv[k] ? `${k}: ${argv[k]}` : null
  })
  .filter(e => e)
  .join(', ')

// Validate
// argv.count = Number.parseInt(argv.count)
let missingRequiredArgs = visibleOpts().filter(k => opts[k].required && !argv[k])
if (missingRequiredArgs.length > 0) {
  // if (!argv[KEY_POP_DATA] && !argv['pop'] && !argv['folder']) {
  missingRequiredArgs.forEach(arg => {
    console.log(`\n\nThe argument --${arg} is required but was not provided.\n\n`)
  })
  argv.help = true
}

// Show help
if (argv.help) {
  console.log(opts.help.banner)
  console.log('\nSupplied Argument Values:\n  ' + argsDisplay)
  console.log('\nAvailable Arguments:\n')
  console.log(
    visibleOpts()
      .map(k => {
        let aliases = Object.keys(opts.alias)
          .reduce((p, c) => {
            if (opts.alias[c] === k) p.push('--' + c)
            return p
          }, [])
          .join(',')
        let args = `  --${k}${aliases.length > 0 ? ' (' + aliases + ')' : ''}${
          opts[k].default ? ', default ' + opts[k].default : ''
        }`
        let tabs = ' '.repeat(38 - args.length)
        return `${args}:${tabs}${opts[k].desc}${opts[k].required ? ' (required)' : ''}`
      })
      .filter(o => o)
      .join('\n')
  )
  return
} else {
  console.log('\nSupplied Argument Values:\n  ' + argsDisplay)
}

let bestByStrategy = {},
  best = [],
  genPath = `${argv.population_data}/gen_${argv.gen}`,
  errFiles = []

if (argv.sim || argv.cmd) {
  let file = `${genPath}/${argv.sim || argv.cmd}`,
    file2 = `${genPath}/sim_${argv.sim || argv.cmd}.json`,
    exists1 = fs.existsSync(file),
    exists2 = fs.existsSync(file2)

  if (!exists1 && !exists2) {
    console.log("Couldn't find file", file, ' or ', file2)
    return
  }
  let result = JSON.parse(fs.readFileSync(exists1 ? file : file2))

  if (argv.sim) {
    const exec = require('child_process').exec

    if (IS_WIN_OS) {
      exec('start /WAIT cmd /k ' + result.commandString.substring(0, result.commandString.indexOf('--filename')))
    } else {
      // 'osascript -e tell application "Terminal" to activate -e tell application "System Events" to tell process "Terminal" to keystroke "t" using command down'
      console.log(result.commandString)
    }
  } else if (argv.cmd) {
    console.log(result.commandString)
  }
  return
}

fs.readdir(genPath, (err, files) => {
  if (err) {
    console.error(err)
    return
  }
  files.forEach(file => {
    if (/^sim_[\d]+\.json$/.test(file)) {
      let result = JSON.parse(fs.readFileSync(`${genPath}/${file}`)).result

      if (result) {
        function addResultToArr(result, arr) {
          result[KEY_BT_GEN] = file
          result[KEY_FITNESS] = fitness(result)

          if (arr.length === 0) arr.push(result)
          else if (arr.length < argv.count || result[argv.prop] > arr[arr.length - 1][argv.prop]) {
            let idx = arr.findIndex((ele, i, a) => {
              return result[argv.prop] > ele[argv.prop]
            })

            if (idx !== -1) {
              arr.splice(idx, 0, result)
              if (arr.length > argv.count) arr.pop()
            } else if (arr.length < argv.count) {
              arr.push(result)
            }
          }
        }

        // Add to bestByStrategy
        if (!bestByStrategy[result[KEY_STRAT]]) bestByStrategy[result[KEY_STRAT]] = []

        addResultToArr(result, bestByStrategy[result[KEY_STRAT]])

        addResultToArr(result, best)
      } else {
        errFiles.push(file)
      }
    }
  })

  function showResult(arr, sum_strats = false) {
    return (
      arr
        .map((r, i) => {
          return (
            `${argv.prop}: ${
              isFloat(r[argv.prop]) ? r[argv.prop].toFixed(argv.float_precision) : r[argv.prop]
            }, ${KEY_STRAT}: ${r[KEY_STRAT]}, file: ${genPath}/${r[KEY_BT_GEN]}` +
            (argv.props
              ? '\n  ' +
                argv.props
                  .split(',')
                  .map(prop => {
                    return `${prop}: ${isFloat(r[prop]) ? r[prop].toFixed(argv.float_precision) : r[prop]}`
                  })
                  .join(', ')
              : '')
          )
        })
        .join('\n') +
      (sum_strats
        ? `\n\nUnique strategies in top ${argv.count}: ` +
          arr
            .reduce((p, c) => {
              if (!p.includes(c[KEY_STRAT])) p.push(c[KEY_STRAT])
              return p
            }, [])
            .join(',')
        : '')
    )
  }

  if (errFiles.length > 0) {
    console.log('')
    console.error("Couldn't parse: " + errFiles.join(', '))
  }

  console.log('')
  console.log('')
  console.log('Summary: ')
  console.log('')
  console.log('=====================')
  console.log('==== by strategy ====')
  console.log('=====================')
  console.log(
    Object.keys(bestByStrategy)
      .map(k => {
        return `\n-------- ${k} ----------------------------------------  \n${showResult(bestByStrategy[k])}`
      })
      .join('\n')
  )
  console.log('')
  console.log('=====================')
  console.log('==== in total =======')
  console.log('=====================')
  console.log('\n' + showResult(best, argv.strats))

  // console.log('ta_trix length', bestByStrategy['ta_trix'].length)
})

function fitness(sim) {
  if (typeof sim === 'undefined') return 0

  var vsBuyHoldRate = (sim.vsBuyHold + 100) / 50
  var wlRatio = sim.wins / sim.losses
  if (isNaN(wlRatio)) {
    // zero trades will result in 0/0 which is NaN
    wlRatio = 1
  }
  var wlRatioRate = 1.0 / (1.0 + Math.pow(Math.E, -wlRatio))
  var rate = vsBuyHoldRate * wlRatioRate
  return rate
}

function isFloat(n) {
  return n === +n && n !== (n | 0)
}

function visibleOpts() {
  return Object.keys(opts).filter(k => !opts.hidden_props.includes(k))
}
