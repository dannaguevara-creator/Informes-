/**
 * mcp-client.js
 * Cliente MCP para Intercom y Slack
 * Conecta a los MCPs disponibles en la sesión remota de Claude
 */

import https from 'https';

class MCPClient {
  constructor(mcpUrl) {
    this.mcpUrl = mcpUrl;
    this.sessionToken = process.env.ANTHROPIC_SESSION_TOKEN || '';
  }

  async callTool(toolName, args) {
    return new Promise((resolve, reject) => {
      const payload = JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: toolName,
          arguments: args,
        },
      });

      const url = new URL(this.mcpUrl);
      const options = {
        hostname: url.hostname,
        port: url.port || 443,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': this.sessionToken ? `Bearer ${this.sessionToken}` : '',
        },
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.error) {
              reject(new Error(`MCP Error: ${response.error.message}`));
            } else {
              resolve(response.result);
            }
          } catch (e) {
            reject(new Error(`Failed to parse MCP response: ${e.message}`));
          }
        });
      });

      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }

  // Intercom API via MCP
  async getIntercomTeams() {
    try {
      return await this.callTool('intercom_get_teams', {});
    } catch (err) {
      console.error('❌ Error getting teams from Intercom MCP:', err.message);
      throw err;
    }
  }

  async searchIntercomConversations(teamId, state) {
    try {
      return await this.callTool('intercom_search_conversations', {
        team_id: teamId,
        state: state,
        per_page: 150,
      });
    } catch (err) {
      console.error(`❌ Error searching conversations for team ${teamId}:`, err.message);
      throw err;
    }
  }

  // Slack API via MCP
  async sendSlackMessage(channel, text, blocks) {
    try {
      return await this.callTool('slack_post_message', {
        channel: channel,
        text: text,
        blocks: blocks,
      });
    } catch (err) {
      console.error('❌ Error sending Slack message via MCP:', err.message);
      throw err;
    }
  }
}

export default MCPClient;
