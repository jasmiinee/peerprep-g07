export function mapUserToView(user) {
  return {
    email: user.email,
    username: user.username,
    role: user.role,
  };
}
