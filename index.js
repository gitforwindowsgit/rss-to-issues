const core = require('@actions/core')
const { getOctokit, context } = require('@actions/github')
const RSSParser = require('rss-parser')
const TurnDown = require('turndown')

const parseDurationInMilliseconds = (text) => {
  let ms = 0

  const milliSeconds = text.match(/(\d+)\s*m/)
  if (milliSeconds) ms += parseInt(milliSeconds[1])
  const seconds = text.match(/(\d+)\s*m/)
  if (seconds) ms += parseInt(seconds[1]) * 1000
  const minutes = text.match(/(\d+)\s*m/)
  if (minutes) ms += parseInt(minutes[1]) * 60000
  const hours = text.match(/(\d+)\s*h/)
  if (hours) ms += parseInt(hours[1]) * 3600000
  const days = text.match(/(\d+)\s*d/)
  if (days) ms += parseInt(days[1]) * 86400000

  return ms
}

const run = async () => {
  try {
    let issueTitlePrefix = core.getInput('prefix')
    issueTitlePrefix = issueTitlePrefix ? issueTitlePrefix + ' ' : ''
    let dryRun = core.getInput('dry-run')
    if (dryRun) dryRun = dryRun === 'true'
    let aggregate = core.getInput('aggregate')
    if (aggregate) aggregate = aggregate === 'true'
    let characterLimit = core.getInput('character-limit')
    if (characterLimit) characterLimit = parseInt(characterLimit)
    const titlePattern = core.getInput('title-pattern')
    const contentPattern = core.getInput('content-pattern')

    const limitTime = Date.now() - parseDurationInMilliseconds(core.getInput('max-age'))
    core.debug(`limitTime ${limitTime}`)

    const labels = core.getInput('labels')
    core.debug(`labels ${labels}`)

    // Instantiate GitHub client
    const octokit = getOctokit(core.getInput('github-token'))

    // Instantiate feed parser
    const feed = await (new RSSParser()).parseURL(core.getInput('feed'))
    core.info(feed.title)

    // Remove old items in feed
    feed.items = feed.items.filter(x => x.pubDate === undefined || limitTime < new Date(x.pubDate).getTime())

    const { data: issues } = await octokit.issues.listForRepo({
      owner: context.repo.owner,
      repo: context.repo.repo,
      state: 'all',
      labels: labels
    })
    core.debug(`${issues.length} issues`)

    const turndownService = new TurnDown()

    const createdIssues = []

    // Iterate
    for (const item of feed.items) {
      let title = `${issueTitlePrefix}${item.title}`
      if (titlePattern && !title.match(titlePattern)) {
        core.debug(`Feed item skipped because it does not match the title pattern (${title})`)
        continue
      }

      core.debug(`Issue '${title}'`)

      if (issues.find(x => x.title === title)) {
        core.warning(`Issue ${title} already exists`)
        continue
      }

      // Issue Content
      const content = item.content || item.description || ''

      if (contentPattern && !content.match(contentPattern)) {
        core.debug$(`Feed item skipped because it does not match the content pattern (${title})`)
        continue
      }

      let markdown = turndownService.turndown(content)

      // truncate if characterLimit > 0
      if (characterLimit && markdown.length > characterLimit) {
        markdown = `${markdown.substr(0, characterLimit)}…\n\n---\n## Would you like to know more?\nRead the full article on the following website:`
      }

      // Render issue content
      const body = `${markdown || ''}\n${item.link ? `\n${item.link}` : ''}`

      // Default to creating an issue per item
      // Create first issue if aggregate
      if (!aggregate || createdIssues.length === 0) {
        // Create Issue
        createdIssues.push({ title, body, labels })
      } else {
        title = `${issueTitlePrefix}${new Date().toTimeString()}`
        createdIssues[0].title = title

        createdIssues[0].body += `\n\n${body}`
      }
    }

    for (const issue of createdIssues) {
      if (dryRun) {
        core.info(`Would create issue '${issue.title}' with content '${issue.body}'`)
      } else {
        try {
          const { data } = await octokit.issues.create({
            owner: context.repo.owner,
            repo: context.repo.repo,
            title: issue.title,
            body: issue.body,
            labels: issue.labels ? issue.labels.split(',') : undefined
          })
          issue.id = data.id
        } catch (e) {
          core.warning(`Failed to create issue ${issue.title}: ${e}`)
          continue
        }
      }
    }

    core.setOutput('issues', createdIssues.map(item => item.id).join(','))
  } catch (e) {
    core.setFailed(e.message)
  }
}

run()
