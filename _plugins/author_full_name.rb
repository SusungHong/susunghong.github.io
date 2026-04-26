# frozen_string_literal: true

# jekyll-feed uses site.author.name; without it, the Atom <author><name> becomes a broken Hash dump.
# Derive full name from first_name + last_name so _config.yml does not need a duplicate `name` key.
Jekyll::Hooks.register :site, :after_init do |site|
  a = site.config["author"]
  next unless a.is_a?(Hash)

  fn = a["first_name"].to_s.strip
  ln = a["last_name"].to_s.strip
  next if fn.empty? && ln.empty?

  if a["name"].to_s.strip.empty?
    a["name"] = [fn, ln].reject(&:empty?).join(" ")
  end
end
