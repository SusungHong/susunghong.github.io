# frozen_string_literal: true

# CV lives in _data/ next to other site data, but must still be emitted as a static URL
# (/assets/pdf/susung_hong_cv.pdf) because Jekyll does not copy non-YAML/JSON files from _data.

module Jekyll
  class DataCvStaticFile < StaticFile
    CV_FILENAME = "susung_hong_cv.pdf".freeze
    PUBLIC_DIR  = File.join("assets", "pdf").freeze

    def initialize(site)
      @site = site
      @base = site.source
      @dir = PUBLIC_DIR
      @name = CV_FILENAME
      @relative_path = File.join(@dir, @name)
      @extname = File.extname(@name)
      @collection = nil
      @type = nil
    end

    def path
      @site.in_source_dir("_data", CV_FILENAME)
    end
  end
end

Jekyll::Hooks.register :site, :post_read do |site|
  src = site.in_source_dir("_data", Jekyll::DataCvStaticFile::CV_FILENAME)
  next unless File.file?(src)

  site.static_files << Jekyll::DataCvStaticFile.new(site)
end
