/**
 * The workflows that report every required status check on main. The
 * updater dispatches each on a head that it updated, because the
 * pull_request runs that its GITHUB_TOKEN push creates wait for approval.
 * Each workflow must declare a workflow_dispatch trigger.
 */
export const REQUIRED_CHECK_WORKFLOWS: readonly string[] = Object.freeze(['ci.yml', 'links.yml']);
