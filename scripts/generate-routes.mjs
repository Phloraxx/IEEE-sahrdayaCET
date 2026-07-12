import { Generator, getConfig } from '@tanstack/router-generator'

const userConfig = getConfig({}, process.cwd())
const generator = new Generator({ config: userConfig, root: process.cwd() })
await generator.run()
console.log('Route tree generated:', generator.generatedRouteTreePath)
process.exit(0)