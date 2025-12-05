export const log = async ({
  message,
  type,
  mention = false,
  data,
}: {
  message: string;
  type: "info" | "cron" | "error" | "trial";
  mention?: boolean;
  //   eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
}) => {
  try {
    /* If in development or env variable not set, log to the console */
    if (
      process.env.NODE_ENV === "development" ||
      !process.env.SLACK_WEBHOOK_URL
    ) {
      return;
    }

    /* Log a message to channel */

    return await fetch(`${process.env.SLACK_WEBHOOK_URL}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              // prettier-ignore
              text: `${mention ? "<@U05BTDUKPLZ> " : ""}${type === "error" ? ":rotating_light: " : ""}${message}`,
            },
          },
          {
            type: "divider",
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "```json\n" + JSON.stringify(data, null, 2) + "\n```",
            },
          },
        ],
      }),
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {}
};
