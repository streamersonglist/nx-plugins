// async function commandDeploySecrets(args: {
//   environment: string;
//   appName: string;
//   secretsEnv?: string;
// }) {
//   const secrets = getSecretsFromEnv(args.secretsEnv || '.env.secrets');
//   const query = gql`
//     mutation ($input: SetSecretsInput!) {
//       setSecrets(input: $input) {
//         release {
//           id
//           version
//           reason
//           description
//           user {
//             id
//             email
//             name
//           }
//           evaluationId
//           createdAt
//         }
//       }
//     }
//   `;
//   const input = {
//     appId: args.appName,
//     secrets: Object.keys(secrets).map((key) => ({
//       key,
//       value: secrets[key],
//     })),
//     replaceAll: false, // if true, it will remove any secrets not included here
//   };

//   try {
//     const response = await request(
//       FLY_URL,
//       query,
//       { input },
//       { Authorization: `Bearer ${process.env.FLY_API_TOKEN}` },
//     );

//     console.log('setSecrets response', JSON.stringify(response, undefined, 2));
//   } catch (error) {
//     console.log('error uploading secrets');
//     if (error instanceof ClientError) {
//       console.log(error.message);
//     }
//   }
// }
