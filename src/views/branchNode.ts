'use strict';
import { Iterables } from '../system';
import { TreeItem, TreeItemCollapsibleState } from 'vscode';
import { CommitNode } from './commitNode';
import { ExplorerBranchesLayout } from '../configuration';
import { GlyphChars } from '../constants';
import { Container } from '../container';
import { ExplorerNode, ExplorerRefNode, MessageNode, ResourceType, ShowAllNode } from './explorerNode';
import { GitExplorer } from './gitExplorer';
import { GitBranch, GitUri } from '../gitService';

export class BranchNode extends ExplorerRefNode {

    readonly supportsPaging: boolean = true;

    constructor(
        public readonly branch: GitBranch,
        uri: GitUri,
        private readonly explorer: GitExplorer
    ) {
        super(uri);
    }

    get current(): boolean {
        return this.branch.current;
    }

    get label(): string {
        const branchName = this.branch.getName();
        if (this.explorer.config.branches.layout === ExplorerBranchesLayout.List) return branchName;

        return GitBranch.isValid(branchName) && !this.current ? this.branch.getBasename() : branchName;
    }

    get ref(): string {
        return this.branch.name;
    }

    async getChildren(): Promise<ExplorerNode[]> {
        const log = await Container.git.getLog(this.uri.repoPath!, { maxCount: this.maxCount, ref: this.branch.name });
        if (log === undefined) return [new MessageNode('No commits yet')];

        let trackingRef: string | undefined = undefined;
        if (this.branch.tracking !== undefined) {
            trackingRef = await Container.git.getMergeBase(this.uri.repoPath!, this.branch.name, this.branch.tracking);
        }

        const children: (CommitNode | ShowAllNode)[] = [...Iterables.map(log.commits.values(), c => new CommitNode(c, this.explorer, this.branch, trackingRef))];
        if (log.truncated) {
            children.push(new ShowAllNode('Show All Commits', this, this.explorer));
        }
        return children;
    }

    async getTreeItem(): Promise<TreeItem> {
        let name = this.label;
        let tooltip = `${this.branch.getName()}${this.branch!.current ? ' (current)' : ''}`;
        let iconSuffix = '';

        if (!this.branch.remote && this.branch.tracking !== undefined) {
            if (this.explorer.config.showTrackingBranch) {
                name += ` ${GlyphChars.Space}${GlyphChars.ArrowLeftRightLong}${this.branch.getTrackingStatus({ prefix: `${GlyphChars.Space} ` })}${GlyphChars.Space} ${this.branch.tracking}`;
            }
            tooltip += `\n\nTracking ${GlyphChars.Dash} ${this.branch.tracking}\n${this.branch.getTrackingStatus({ empty: 'up-to-date', expand: true, separator: '\n' })}`;

            if (this.branch.state.ahead || this.branch.state.behind) {
                if (this.branch.state.behind) {
                    iconSuffix = '-red';
                }
                if (this.branch.state.ahead) {
                    iconSuffix = this.branch.state.behind ? '-yellow' : '-green';
                }
            }
        }

        const item = new TreeItem(`${this.branch!.current ? `${GlyphChars.Check} ${GlyphChars.Space}` : ''}${name}`, TreeItemCollapsibleState.Collapsed);
        item.tooltip = tooltip;

        if (this.branch.remote) {
            item.contextValue = ResourceType.RemoteBranch;
        }
        else if (this.branch.current) {
            item.contextValue = !!this.branch.tracking
                ? ResourceType.CurrentBranchWithTracking
                : ResourceType.CurrentBranch;
        }
        else {
            item.contextValue = !!this.branch.tracking
                ? ResourceType.BranchWithTracking
                : ResourceType.Branch;
        }

        item.iconPath = {
            dark: Container.context.asAbsolutePath(`images/dark/icon-branch${iconSuffix}.svg`),
            light: Container.context.asAbsolutePath(`images/light/icon-branch${iconSuffix}.svg`)
        };

        return item;
    }
}
