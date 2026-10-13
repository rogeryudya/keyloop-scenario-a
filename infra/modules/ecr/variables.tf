variable "name" {
  description = "Repository name, e.g. keyloop-api."
  type        = string
}

variable "image_tag_mutability" {
  description = "MUTABLE or IMMUTABLE. IMMUTABLE in real AWS, so a tag always means the same image."
  type        = string
  default     = "IMMUTABLE"

  validation {
    condition     = contains(["MUTABLE", "IMMUTABLE"], var.image_tag_mutability)
    error_message = "image_tag_mutability must be MUTABLE or IMMUTABLE."
  }
}

variable "scan_on_push" {
  description = "Scan each pushed image for known vulnerabilities."
  type        = bool
  default     = true
}

variable "max_image_count" {
  description = "Images kept by the lifecycle policy; older ones expire."
  type        = number
  default     = 10

  validation {
    condition     = var.max_image_count >= 1
    error_message = "max_image_count must be at least 1."
  }
}

variable "untagged_expiry_days" {
  description = "Days after which untagged images (left behind when a tag moves) expire."
  type        = number
  default     = 1

  validation {
    condition     = var.untagged_expiry_days >= 1
    error_message = "untagged_expiry_days must be at least 1."
  }
}

variable "force_delete" {
  description = "Delete the repository even if it holds images. true only for throwaway environments."
  type        = bool
  default     = false
}
